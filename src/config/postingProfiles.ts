export interface PostingProfile {
  name: string;
  activeHours: number[];
  weekdayWeight: number;
  weekendWeight: number;
  actionWeights: {
    scroll: number;
    like: number;
    comment: number;
    post: number;
  };
  contentWeights: {
    newsOpinion: number;
    industryObservation: number;
    workUpdate: number;
    lesson: number;
    question: number;
    funnyObservation: number;
  };
}

export const POSTING_PROFILES: Record<string, PostingProfile> = {
  engineer: {
    name: "engineer",
    activeHours: [8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
    weekdayWeight: 1.0,
    weekendWeight: 0.4,
    actionWeights: { scroll: 0.65, like: 0.22, comment: 0.10, post: 0.03 },
    contentWeights: {
      newsOpinion: 0.05,
      industryObservation: 0.05,
      workUpdate: 0.05,
      lesson: 0.05,
      question: 0.05,
      funnyObservation: 0.75
    }
  },
  designer: {
    name: "designer",
    activeHours: [9, 10, 11, 12, 14, 15, 16, 17, 18, 20, 21, 22],
    weekdayWeight: 1.0,
    weekendWeight: 0.6,
    actionWeights: { scroll: 0.60, like: 0.25, comment: 0.11, post: 0.04 },
    contentWeights: {
      newsOpinion: 0.05,
      industryObservation: 0.05,
      workUpdate: 0.05,
      lesson: 0.05,
      question: 0.05,
      funnyObservation: 0.75
    }
  },
  marketer: {
    name: "marketer",
    activeHours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    weekdayWeight: 1.2,
    weekendWeight: 0.3,
    actionWeights: { scroll: 0.55, like: 0.25, comment: 0.15, post: 0.05 },
    contentWeights: {
      newsOpinion: 0.05,
      industryObservation: 0.05,
      workUpdate: 0.05,
      lesson: 0.05,
      question: 0.05,
      funnyObservation: 0.75
    }
  },
  lurker: {
    name: "lurker",
    activeHours: [7, 8, 12, 13, 18, 19, 20, 21, 22, 23],
    weekdayWeight: 1.0,
    weekendWeight: 1.3,
    actionWeights: { scroll: 0.94, like: 0.05, comment: 0.01, post: 0.00 },
    contentWeights: {
      newsOpinion: 0.0,
      industryObservation: 0.0,
      workUpdate: 0.0,
      lesson: 0.0,
      question: 0.0,
      funnyObservation: 0.0
    }
  },
  influencer: {
    name: "influencer",
    activeHours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    weekdayWeight: 1.0,
    weekendWeight: 0.8,
    actionWeights: { scroll: 0.40, like: 0.30, comment: 0.22, post: 0.08 },
    contentWeights: {
      newsOpinion: 0.05,
      industryObservation: 0.05,
      workUpdate: 0.05,
      lesson: 0.05,
      question: 0.05,
      funnyObservation: 0.75
    }
  },
  standard: {
    name: "standard",
    activeHours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    weekdayWeight: 1.0,
    weekendWeight: 0.8,
    actionWeights: { scroll: 0.70, like: 0.20, comment: 0.08, post: 0.02 },
    contentWeights: {
      newsOpinion: 0.05,
      industryObservation: 0.05,
      workUpdate: 0.05,
      lesson: 0.05,
      question: 0.05,
      funnyObservation: 0.75
    }
  }
};
