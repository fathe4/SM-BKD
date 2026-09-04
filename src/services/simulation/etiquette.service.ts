import { supabaseAdmin } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { UUID } from "crypto";
import { EngagementScoreInput } from "../../models/ai-persona.model";

export class EtiquetteService {
  /**
   * Evaluates an agent's response strategy on a given post, applying social constraints and enqueuing jobs.
   */
  static async evaluateEngagement(personaId: string, candidate: any): Promise<void> {
    try {
      // Resolve content dynamically if it's a user post or AI post to avoid duplicating content in database
      let candidateSummary = candidate.summary || "";
      let candidateTitle = candidate.title || "";
      if ((candidate.candidate_type === "user_post" || candidate.candidate_type === "ai_post") && candidate.reference_id) {
        if (candidate._resolvedContent) {
          candidateSummary = candidate._resolvedContent.summary;
          candidateTitle = candidate._resolvedContent.title;
        } else {
          const { data: post } = await supabaseAdmin!
            .from("posts")
            .select("content")
            .eq("id", candidate.reference_id)
            .single();
          if (post && post.content) {
            candidateSummary = post.content;
            candidateTitle = post.content.slice(0, 80) + "...";
            candidate._resolvedContent = {
              summary: candidateSummary,
              title: candidateTitle
            };
          }
        }
      }

      // 1. Fetch persona's profile, state, and conversation preferences
      const { data: persona } = await supabaseAdmin!
        .from("persona_identities")
        .select("*, persona_states(*), persona_conversation_profiles(*)")
        .eq("id", personaId)
        .single();

      if (!persona || !persona.persona_states || !persona.persona_conversation_profiles) {
        return;
      }

      const state = persona.persona_states;
      const profile = persona.persona_conversation_profiles;

      // 2. Respect waking hour constraints (awake if local time between 7am and 11pm)
      const timezoneOffset = this.getTimezoneOffset(persona.timezone);
      const localHour = (new Date().getUTCHours() + timezoneOffset + 24) % 24;
      if (localHour < 7 || localHour > 23) {
        logger.info(`Persona @${persona.username} is sleeping (local hour: ${localHour}). Skipping evaluation.`);
        return;
      }

      // Count pending/processing COMMENT jobs in the queue
      const { count: pendingCommentJobs } = await supabaseAdmin!
        .from("behavior_jobs")
        .select("id", { count: "exact", head: true })
        .eq("persona_id", personaId)
        .eq("action_type", "COMMENT")
        .in("status", ["pending", "processing"]);

      const effectiveCommentCount = (state.today_comment_count || 0) + (pendingCommentJobs || 0);

      // Check daily rate limits
      if (effectiveCommentCount >= profile.max_comments_per_thread * 5) {
        logger.info(`Persona @${persona.username} reached daily interaction limits (effective comment count: ${effectiveCommentCount}). Skipping.`);
        return;
      }

      // 3. Thread protection rules: If candidate is a post, check comment history
      let postCreatorId = "";
      let commentsCount = 0;
      let aiCommentsCount = 0;
      let humanCommentsCount = 0;
      let isDuplicateComment = false;
      let hasPersonaAlreadyCommented = false;
      let hasPersonaLiked = false;
      let consecutiveAiComments = 0;
      let uniqueAiUsersCount = 0;

      let postCreatorUsername = "unknown";
      if (candidate.reference_id) {
        const { data: post } = await supabaseAdmin!
          .from("posts")
          .select("user_id, users(username)")
          .eq("id", candidate.reference_id)
          .single();

        if (post) {
          postCreatorId = post.user_id;
          postCreatorUsername = (post as any).users?.username || "unknown";
        }

        // Check if there is already a pending or processing behavior job for this persona and post
        const { data: existingJobs } = await supabaseAdmin!
          .from("behavior_jobs")
          .select("id, action_type")
          .eq("persona_id", personaId)
          .in("status", ["pending", "processing"])
          .eq("payload->>post_id", candidate.reference_id);

        if (existingJobs && existingJobs.length > 0) {
          logger.info(`Persona @${persona.username} already has a pending/processing job for post ${candidate.reference_id}. Skipping.`);
          return;
        }

        // Cooldown: check if this persona interacted with the post creator in the last 20 minutes
        if (postCreatorId) {
          const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();
          const { data: recentTargetJobs } = await supabaseAdmin!
            .from("behavior_jobs")
            .select("id")
            .eq("persona_id", personaId)
            .eq("payload->>target_user_id", postCreatorId)
            .gt("created_at", twentyMinutesAgo)
            .limit(1);

          if (recentTargetJobs && recentTargetJobs.length > 0) {
            logger.info(`Persona @${persona.username} interacted with author ${postCreatorId} recently (cooldown active). Skipping.`);
            return;
          }
        }

        // Check if persona has already liked this post
        const { data: existingLike } = await supabaseAdmin!
          .from("reactions")
          .select("id")
          .eq("user_id", persona.user_id)
          .eq("target_id", candidate.reference_id)
          .maybeSingle();

        hasPersonaLiked = !!existingLike;

        // Fetch comments to inspect thread composition and check novelty
        const { data: comments } = await supabaseAdmin!
          .from("comments")
          .select("id, content, user_id, created_at, users(is_ai)")
          .eq("post_id", candidate.reference_id);

        if (comments) {
          commentsCount = comments.length;
          
          const uniqueAiUsers = new Set<string>();
          comments.forEach((c: any) => {
            const isAi = c.users?.is_ai;
            if (isAi) {
              aiCommentsCount++;
              uniqueAiUsers.add(c.user_id);
            } else {
              humanCommentsCount++;
            }
            if (c.user_id === personaId) {
              hasPersonaAlreadyCommented = true;
            }
          });
          uniqueAiUsersCount = uniqueAiUsers.size;

          // Check consecutive AI comments (last N comments that are AI)
          const sortedComments = [...comments].sort((a: any, b: any) => {
            const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return timeA - timeB;
          });
          
          for (let i = sortedComments.length - 1; i >= 0; i--) {
            if ((sortedComments[i].users as any)?.is_ai) {
              consecutiveAiComments++;
            } else {
              break;
            }
          }

          // Check Novelty: If any existing comment shares > 50% keyword similarity, mark as duplicate
          const candidateWords = new Set(candidateSummary.toLowerCase().split(/\s+/));
          for (const c of comments) {
            const commentWords = c.content.toLowerCase().split(/\s+/);
            const matches = commentWords.filter((w: string) => candidateWords.has(w)).length;
            const similarity = matches / Math.max(1, commentWords.length);
            if (similarity > 0.5) {
              isDuplicateComment = true;
              break;
            }
          }
        }
      }

      // Invariant 3: Human conversations are protected & AI self-spam is prevented.
      // Rule A: Prevent self-spam (same persona commenting multiple times on the same post) - applies to both HUMAN and AI posts.
      if (hasPersonaAlreadyCommented) {
        logger.info(`Persona @${persona.username} already commented on thread ${candidate.reference_id}. Skipping to avoid self-spam.`);
        return;
      }

      const isHumanPost = candidate.origin === "HUMAN";
      if (isHumanPost) {
        const isDev = process.env.NODE_ENV === "development" || process.env.DISABLE_HUMAN_THREAD_PROTECTION === "true";
        const maxAiParticipants = isDev ? 12 : 6; // Relaxed in dev, 6 in production/beta

        // Rule B: Limit total unique AI participants
        if (uniqueAiUsersCount >= maxAiParticipants) {
          logger.info(`Human thread protection triggered for post ${candidate.reference_id}. AI participant limit reached (${uniqueAiUsersCount}/${maxAiParticipants}). AI replies locked.`);
          // Downgrade to potential LIKE or IGNORE
          if (Math.random() < profile.reply_probability * 0.5) {
            if (!hasPersonaLiked) {
              await this.queueAction(personaId, persona.username, "LIKE", { post_id: candidate.reference_id, target_user_id: postCreatorId }, profile.avg_response_delay_minutes);
            }
          }
          return;
        }

        // Rule C: Prevent consecutive AI comments dominating the thread (if last 3 comments are AI, pause AI activity)
        if (consecutiveAiComments >= 3 && !isDev) {
          logger.info(`Thread ${candidate.reference_id} is temporarily dominated by AI (last ${consecutiveAiComments} comments are AI). Locking replies.`);
          return;
        }
      }

      // 4. Retrieve target relationship values
      let relationshipScore = 0.5;
      if (postCreatorId) {
        const { data: rel } = await supabaseAdmin!
          .from("persona_user_relationships")
          .select("trust, respect")
          .eq("persona_id", personaId)
          .eq("user_id", postCreatorId)
          .maybeSingle();

        if (rel) {
          relationshipScore = (rel.trust + rel.respect) / 2;
        }
      }

      // 5. Compute dynamic engagement probabilities
      const input: EngagementScoreInput = {
        interest: candidate.importance,
        relationship: relationshipScore,
        curiosity: persona.curiosity,
        goalAlignment: 0.5,
        novelty: isDuplicateComment ? 0.1 : 1.0,
        currentEnergy: state.energy,
        conversationFatigue: commentsCount * 0.1, // Saturation increases with thread length
        threadSaturation: aiCommentsCount * 0.2
      };

      const engagementScore = this.computeEngagementScore(input);

      const baseViewProbability = (
        (0.50 * (candidate.importance ?? 0.6)) +
        (0.30 * relationshipScore) +
        (0.20 * state.energy)
      );
      // Boost view probability for real human and AI posts to make sure they get viewed more often.
      // Introduce randomized variance for human posts so they do not always receive the exact same view count.
      const humanVariance = 1.6 + Math.random() * 0.4; // Random multiplier between 1.6 and 2.0
      let finalViewProbability = candidate.origin === "HUMAN"
        ? Math.min(0.98, baseViewProbability * humanVariance)
        : Math.min(0.95, baseViewProbability * 1.8);

      // Boost view probability for active user/persona posts to ensure they get viewed and never stay at 0 views
      if (candidate.candidate_type === "user_post") {
        const appeal = this.getPostAppealFactor(candidate.id);
        // Boost view probability by scaling with appeal factor instead of shrinking it.
        finalViewProbability = Math.min(0.99, finalViewProbability * (1.0 + appeal * 0.8));
      }



      logger.info(`@${persona.username} evaluating candidate post by @${postCreatorUsername}: "${candidate.title.slice(0, 50)}..." (View prob: ${(finalViewProbability * 100).toFixed(1)}%)`);

      const viewRoll = Math.random();
      const didView = viewRoll < finalViewProbability;

      if (!didView) {
        logger.info(`@${persona.username} scrolled past candidate post by @${postCreatorUsername} without viewing.`);
        // Mark as seen so they don't get stuck on it in the queue
        await supabaseAdmin!
          .from("feed_items")
          .update({ seen: true })
          .eq("persona_id", personaId)
          .eq("feed_candidate_id", candidate.id);
        return;
      }

      // Record the view
      logger.info(`👀 @${persona.username} viewed post by @${postCreatorUsername}: "${candidateTitle.slice(0, 50)}..."`);
      
      // Update post view count
      if (candidate.reference_id && candidate.candidate_type === "user_post") {
        const { data: post } = await supabaseAdmin!
          .from("posts")
          .select("view_count")
          .eq("id", candidate.reference_id)
          .single();
        if (post) {
          // Increment by 1 for the persona, plus a random range of guest/anonymous views (e.g., 2 to 5)
          const guestViews = Math.floor(Math.random() * 4) + 2;
          const newViews = (post.view_count || 0) + guestViews;
          await supabaseAdmin!
            .from("posts")
            .update({ view_count: newViews })
            .eq("id", candidate.reference_id);
          logger.info(`📈 Incremented view count by ${guestViews} (total: ${newViews}) for @${postCreatorUsername}'s post: "${candidateTitle.slice(0, 50)}..."`);
        }
      }

      // Update content metrics views
      const { data: metric } = await supabaseAdmin!
        .from("content_metrics")
        .select("views")
        .eq("feed_candidate_id", candidate.id)
        .maybeSingle();
      if (metric) {
        const guestViews = Math.floor(Math.random() * 4) + 2;
        await supabaseAdmin!
          .from("content_metrics")
          .update({ views: (metric.views || 0) + guestViews })
          .eq("feed_candidate_id", candidate.id);
      }

      // Mark the feed item as seen since the persona has now viewed it
      await supabaseAdmin!
        .from("feed_items")
        .update({ seen: true })
        .eq("persona_id", personaId)
        .eq("feed_candidate_id", candidate.id);

      // 7. Action selection probabilities (Etiquette Engine)
      const roll = Math.random();

      // If the candidate doesn't have a reference_id, it is a news article or trending candidate without a post, so we cannot like or comment.
      if (!candidate.reference_id) {
        logger.info(`@${persona.username} viewed candidate "${candidate.title}" but it has no post reference. Skipping interaction.`);
        return;
      }

      // Global Swarm Cooldown (to prevent multiple personas interacting in a short burst)
      const cooldownMinutes = isHumanPost ? 0.25 : 1.5; // 15 seconds for human posts, 90 seconds for AI posts
      const cooldownThreshold = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();

      // 3. Dynamic pacing based on existing likes count to prevent rapid accumulation ("slowdown effect")
      let likesSlowdownMultiplier = 1.0;
      let likesAdditionalDelayMinutes = 0;

      if (candidate.reference_id) {
        const { count: totalLikes } = await supabaseAdmin!
          .from("reactions")
          .select("id", { count: "exact", head: true })
          .eq("target_id", candidate.reference_id)
          .eq("reaction_type", "like");

        const likesCount = totalLikes || 0;

        if (likesCount > 0) {
          if (likesCount >= 15) {
            likesSlowdownMultiplier = 0.05; // 95% reduction in chance
            likesAdditionalDelayMinutes = Math.floor(Math.random() * 120) + 90; // +90 to 210 mins delay
          } else if (likesCount >= 8) {
            likesSlowdownMultiplier = 0.15; // 85% reduction in chance
            likesAdditionalDelayMinutes = Math.floor(Math.random() * 60) + 45; // +45 to 105 mins delay
          } else if (likesCount >= 4) {
            likesSlowdownMultiplier = 0.4; // 60% reduction in chance
            likesAdditionalDelayMinutes = Math.floor(Math.random() * 30) + 20; // +20 to 50 mins delay
          } else {
            // 1-3 likes
            likesSlowdownMultiplier = 0.75; // 25% reduction in chance
            likesAdditionalDelayMinutes = Math.floor(Math.random() * 15) + 5; // +5 to 20 mins delay
          }
          
          logger.info(`Likes slowdown active for post ${candidate.reference_id}: current likes = ${likesCount}, multiplier = ${likesSlowdownMultiplier}, extra delay = ${likesAdditionalDelayMinutes}m`);
        }
      }

      let spacingDelay = likesAdditionalDelayMinutes;

      // 1. Post-level pacing check
      const { data: recentPostJobs } = await supabaseAdmin!
        .from("behavior_jobs")
        .select("id")
        .eq("payload->>post_id", candidate.reference_id)
        .gt("created_at", cooldownThreshold)
        .limit(3); // check up to 3 recent jobs

      if (recentPostJobs && recentPostJobs.length > 0) {
        // Calculate incremental spacing delay: 3-15 minutes extra delay per recent interaction to queue them nicely
        spacingDelay += (recentPostJobs.length * (Math.floor(Math.random() * 5) + 3));
        logger.info(`Pacing active for post ${candidate.reference_id}. Adding +${spacingDelay}m scheduling delay for @${persona.username}.`);
      }

      // 2. Author-level pacing check
      if (postCreatorId) {
        const { data: recentAuthorJobs } = await supabaseAdmin!
          .from("behavior_jobs")
          .select("id")
          .eq("payload->>target_user_id", postCreatorId)
          .gt("created_at", cooldownThreshold)
          .limit(2);

        if (recentAuthorJobs && recentAuthorJobs.length > 0) {
          spacingDelay += (recentAuthorJobs.length * (Math.floor(Math.random() * 4) + 2));
        }
      }
      
      // Invariant 4: Check if redundant comment should be cancelled
      if (isDuplicateComment && roll < profile.reply_probability) {
        logger.info(`Duplication/redundancy detected. Cancelling comment action for @${persona.username}.`);
        // Downgrade to like or ignore
        if (Math.random() < 0.3 && !hasPersonaLiked) {
          await this.queueAction(personaId, persona.username, "LIKE", { post_id: candidate.reference_id, target_user_id: postCreatorId }, profile.avg_response_delay_minutes);
        }
        return;
      }

      // Adjust interaction probabilities to align with organic like-to-view ratios (5% - 20% max)
      // Real-user (HUMAN) posts use higher caps so engagement completes within the 5-minute fast-burst window
      const interactionMultiplier = candidate.origin === "HUMAN" ? 5.5 : 4.0;
      const commentChanceCap = candidate.origin === "HUMAN" ? 0.15 : 0.08;
      const likeChanceCap = candidate.origin === "HUMAN" ? 0.30 : 0.20;
      const commentChance = Math.min(commentChanceCap, engagementScore * profile.reply_probability * interactionMultiplier * 0.15 * likesSlowdownMultiplier);
      const likeChance = Math.min(likeChanceCap, engagementScore * (profile.reply_probability + profile.emoji_probability) * interactionMultiplier * 0.4 * likesSlowdownMultiplier);

      logger.info(`🎲 @${persona.username} evaluating interaction on @${postCreatorUsername}'s post: [Like chance: ${(likeChance * 100).toFixed(1)}%] [Comment chance: ${(commentChance * 100).toFixed(1)}%]`);

      let enqueuedSomething = false;

      // 1. Evaluate LIKE (Lower barrier, checked independently)
      if (roll < likeChance) {
        if (!hasPersonaLiked) {
          // Fast burst for real-user posts: 15-75 seconds. Otherwise, standard pacing.
          const delay = candidate.origin === "HUMAN"
            ? (Math.floor(Math.random() * 61) + 15) / 60
            : Math.max(1, Math.round(profile.avg_response_delay_minutes * 0.3)) + spacingDelay;
          await this.queueAction(personaId, persona.username, "LIKE", { post_id: candidate.reference_id, target_user_id: postCreatorId }, delay);
          logger.info(`❤️ @${persona.username} decided to LIKE @${postCreatorUsername}'s post (enqueued with ${delay.toFixed(2)}m delay).`);
          enqueuedSomething = true;
        } else {
          logger.info(`@${persona.username} wanted to like post ${candidate.reference_id} but already liked it.`);
        }
      }

      // 2. Evaluate COMMENT (Higher barrier, checked independently via a separate roll)
      const commentRoll = Math.random();
      if (commentRoll < commentChance) {
        // Fast burst for real-user posts: 30-150 seconds. Otherwise, standard pacing.
        const delay = candidate.origin === "HUMAN"
          ? (Math.floor(Math.random() * 121) + 30) / 60
          : Math.max(1, Math.round(profile.avg_response_delay_minutes * (1.5 - state.energy))) + spacingDelay;
        await this.queueAction(personaId, persona.username, "COMMENT", { post_id: candidate.reference_id, target_user_id: postCreatorId, candidate_id: candidate.id }, delay);
        logger.info(`💬 @${persona.username} decided to COMMENT on @${postCreatorUsername}'s post (enqueued with ${delay.toFixed(2)}m delay).`);
        enqueuedSomething = true;
      }

      if (!enqueuedSomething) {
        logger.info(`@${persona.username} decided not to react to @${postCreatorUsername}'s post.`);
      }

    } catch (err: any) {
      logger.error(`Error in Etiquette evaluation for persona ${personaId}: ${err.message}`);
    }
  }

  private static computeEngagementScore(input: EngagementScoreInput): number {
    const baseScore = (
      (0.35 * input.interest) +
      (0.20 * input.relationship) +
      (0.15 * input.curiosity) +
      (0.15 * input.goalAlignment) +
      (0.10 * input.novelty) +
      (0.05 * input.currentEnergy)
    );
    const fatigueFactor = (1.0 - input.conversationFatigue) * (1.0 - input.threadSaturation);
    return Math.max(0, baseScore * Math.max(0.1, fatigueFactor));
  }

  private static async queueAction(personaId: string, username: string, actionType: string, payload: any, delayMinutes: number): Promise<void> {
    const runAt = new Date(Date.now() + delayMinutes * 60000).toISOString();
    
    const priority = actionType === "COMMENT" ? 5 : 1;
    
    await supabaseAdmin!
      .from("behavior_jobs")
      .insert({
        persona_id: personaId,
        action_type: actionType,
        payload,
        run_at: runAt,
        status: "pending",
        priority
      });

    logger.info(`✅ Enqueued behavior job [${actionType}] for @${username} to run at ${runAt} (in ${delayMinutes} minutes)`);
  }

  private static getTimezoneOffset(tz: string): number {
    // Basic mapping
    const map: Record<string, number> = {
      'EST': -5,
      'EDT': -4,
      'PST': -8,
      'PDT': -7,
      'UTC': 0,
      'GMT': 0,
      'CET': 1,
      'CEST': 2
    };
    return map[tz.toUpperCase()] || 0;
  }

  private static getPostAppealFactor(postId: string): number {
    if (!postId) return 0.5;
    let hash = 0;
    for (let i = 0; i < postId.length; i++) {
      hash = postId.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Return a factor between 0.15 and 0.95
    const positiveHash = Math.abs(hash);
    return 0.15 + (positiveHash % 81) / 100;
  }
}
