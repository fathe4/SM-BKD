import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";

export class RankingService {
  /**
   * Calculates relevance scores for all candidates and caches the top 100 for each active persona.
   * Optimizes by completely excluding feed candidates the persona has already seen.
   */
  static async refreshFeedCaches(): Promise<void> {
    // 1. Get all active personas
    const { data: personas, error: personaErr } = await supabaseAdmin!
      .from("persona_identities")
      .select("id, username");

    if (personaErr || !personas) {
      logger.error(`Error fetching personas for ranking: ${personaErr?.message}`);
      return;
    }

    // 2. Fetch all active candidates and their metrics
    const { data: candidates, error: candidateErr } = await supabaseAdmin!
      .from("feed_candidates")
      .select("*, content_metrics(*)")
      .or(`expires_at.gt.${new Date().toISOString()},expires_at.is.null`)
      .order("published_at", { ascending: false })
      .limit(300);

    if (candidateErr || !candidates) {
      logger.error(`Error fetching feed candidates for ranking: ${candidateErr?.message}`);
      return;
    }

    // 3. Fetch all seen feed items globally to exclude them from the ranking loop
    const { data: allSeenItems, error: seenErr } = await supabaseAdmin!
      .from("feed_items")
      .select("persona_id, feed_candidate_id")
      .eq("seen", true);

    if (seenErr) {
      logger.error(`Error fetching seen items: ${seenErr.message}`);
    }

    const seenMap = new Map<string, Set<string>>();
    (allSeenItems || []).forEach((item: any) => {
      if (!seenMap.has(item.persona_id)) {
        seenMap.set(item.persona_id, new Set<string>());
      }
      seenMap.get(item.persona_id)!.add(item.feed_candidate_id);
    });

    // 4. Fetch all interests for all personas in a single query
    const { data: allInterests, error: interestErr } = await supabaseAdmin!
      .from("persona_interests")
      .select("persona_id, weight, entities(name)");

    if (interestErr) {
      logger.error(`Error fetching all interests: ${interestErr.message}`);
    }

    // Map interests by persona_id
    const interestMapByPersona = new Map<string, Record<string, number>>();
    (allInterests || []).forEach((interest: any) => {
      const pId = interest.persona_id;
      if (!interestMapByPersona.has(pId)) {
        interestMapByPersona.set(pId, {});
      }
      if (interest.entities?.name) {
        interestMapByPersona.get(pId)![interest.entities.name.toLowerCase()] = interest.weight;
      }
    });

    // Fetch all referenced posts for candidates of type user_post/ai_post to avoid duplicating content in database
    const postIds = candidates
      .filter(c => (c.candidate_type === "user_post" || c.candidate_type === "ai_post") && c.reference_id)
      .map(c => c.reference_id);

    const postMap = new Map<string, { content: string; imageUrl?: string | null }>();
    if (postIds.length > 0) {
      try {
        const { data: posts } = await supabaseAdmin!
          .from("posts")
          .select("id, content, post_media(media_url)")
          .in("id", postIds);

        (posts || []).forEach((p: any) => {
          const mList = p.post_media as any[];
          const mediaUrl = mList && mList.length > 0 ? mList[0].media_url : null;
          postMap.set(p.id, {
            content: p.content || "",
            imageUrl: mediaUrl
          });
        });
      } catch (err: any) {
        logger.error(`Error fetching posts for ranking feed candidates: ${err.message}`);
      }
    }

    logger.info(`Ranking ${candidates.length} candidates for ${personas.length} personas (excluding seen items)...`);

    const allTop100Items: { persona_id: string; feed_candidate_id: string; score: number; reason: string }[] = [];

    for (const persona of personas) {
      const seenSet = seenMap.get(persona.id) || new Set<string>();
      const interestMap = interestMapByPersona.get(persona.id) || {};

      const rankedItems: { persona_id: string; feed_candidate_id: string; score: number; reason: string }[] = [];

      for (const candidate of candidates) {
        // Optimization: Do not rank or include posts the persona has already seen
        if (seenSet.has(candidate.id)) {
          continue;
        }

        // Staggered distribution: new posts are distributed to personas gradually.
        // Real-user (HUMAN) posts use a short 4-minute window so all AI engagement lands within ~5 minutes;
        // AI posts keep the organic 60-minute window.
        const candPublishedTime = new Date(candidate.published_at).getTime();
        const candAgeMinutes = (Date.now() - candPublishedTime) / 60000;
        const distributionWindowMinutes = candidate.origin === "HUMAN" ? 4 : 60;
        if (candAgeMinutes < distributionWindowMinutes) {
          // Generate a consistent pseudo-random distribution delay for this persona-candidate pair
          const seedStr = `${persona.id}-${candidate.id}`;
          let hash = 0;
          for (let i = 0; i < seedStr.length; i++) {
            hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
          }
          const distributionDelay = Math.abs(hash) % distributionWindowMinutes;
          
          if (candAgeMinutes < distributionDelay) {
            // Not yet distributed to this persona's feed cache
            continue;
          }
        }

        // Dynamic content resolution to avoid database content duplication
        const postData = candidate.reference_id ? postMap.get(candidate.reference_id) : null;
        const candidateTitle = postData ? (postData.content ? postData.content.slice(0, 80) + "..." : "New Post") : candidate.title;
        const candidateSummary = postData ? postData.content : candidate.summary;
        const candidateImageUrl = postData ? postData.imageUrl : (candidate.imageUrl || candidate.imageurl);

        let interestScore = 0.2; // Default baseline interest
        if (candidateImageUrl) {
          // Visual content gets higher baseline interest
          interestScore = 0.5;
        }

        // For human posts, force a high baseline interest score so everyone pays attention to the user
        if (candidate.origin === "HUMAN") {
          interestScore = 0.85;
        }

        // Compute interest match based on topics and content
        const candidateText = `${candidateTitle} ${candidateSummary} ${candidate.topics.join(" ")}`.toLowerCase();
        for (const [topic, weight] of Object.entries(interestMap)) {
          if (candidateText.includes(topic)) {
            interestScore = Math.max(interestScore, weight);
          }
        }

        // Origin weighting
        let originWeight = 0.5;
        if (candidate.origin === "HUMAN") originWeight = 1.0;
        else if (candidate.origin === "AI") originWeight = 0.9;
        else if (candidate.origin === "NEWS" || candidate.origin === "SYSTEM" || candidate.origin === "REDDIT") originWeight = 0.6;

        // Recency decay
        const publishedTime = new Date(candidate.published_at).getTime();
        const ageHours = (Date.now() - publishedTime) / (3600 * 1000);
        const recencyDecay = Math.pow(0.5, ageHours / 12);

        // Social Metrics modifier
        const metrics = candidate.content_metrics;
        const interactionScore = metrics ? (metrics.likes * 0.1 + metrics.comments * 0.2) : 0;
        const socialMultiplier = Math.min(1.5, 1.0 + interactionScore);

        // Compute final score
        let score = interestScore * originWeight * recencyDecay * socialMultiplier * candidate.importance;

        if (candidate.imageUrl || candidate.imageurl) {
          score *= 1.4;
        }

        let reason = "Baseline interest feed candidate.";
        if (interestScore > 0.7) reason = `Highly relevant to interest in topics.`;
        if (candidate.origin === "HUMAN") reason += " Prioritizing Human post.";
        if (candidate.imageUrl || candidate.imageurl) reason += " Image boost.";

        rankedItems.push({
          persona_id: persona.id,
          feed_candidate_id: candidate.id,
          score: parseFloat(score.toFixed(4)),
          reason
        });
      }

      // Sort and take top 100
      rankedItems.sort((a, b) => b.score - a.score);
      const top100 = rankedItems.slice(0, 100);
      allTop100Items.push(...top100);
    }

    // 5. Batch delete and upsert to Supabase
    if (allTop100Items.length > 0) {
      const personaIds = personas.map(p => p.id);
      const { error: deleteErr } = await supabaseAdmin!
        .from("feed_items")
        .delete()
        .in("persona_id", personaIds)
        .eq("seen", false);

      if (deleteErr) {
        logger.error(`Error batch deleting unseen feed items: ${deleteErr.message}`);
      }

      const chunkSize = 500;
      for (let i = 0; i < allTop100Items.length; i += chunkSize) {
        const chunk = allTop100Items.slice(i, i + chunkSize);
        const { error: upsertErr } = await supabaseAdmin!
          .from("feed_items")
          .upsert(chunk, { onConflict: "persona_id, feed_candidate_id" });

        if (upsertErr) {
          logger.error(`Error batch upserting ranked items chunk: ${upsertErr.message}`);
        }
      }
    }

    // Prune old feed items
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    await supabaseAdmin!
      .from("feed_items")
      .delete()
      .lt("created_at", thirtyDaysAgo);
  }
}
