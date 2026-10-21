// The Story Bank: a personal evidence library organised into the life areas applicants draw on.
// Sections 01–12 hold entries; section 13 is the documents page (supporting_documents).

export const PRIVACY_LEVELS = ["private", "ask", "available"] as const;
export type Privacy = (typeof PRIVACY_LEVELS)[number];

export const PRIVACY_LABELS: Record<Privacy, string> = {
  private: "Private",
  ask: "Ask first",
  available: "Available",
};

export const PRIVACY_DESCRIPTIONS: Record<Privacy, string> = {
  private: "Never sent to the AI — not for drafting, questions or review.",
  ask: "Used only in an essay you approve it for. Until then, nothing about it is sent to the AI.",
  available: "The AI may use it whenever it is relevant to an essay.",
};

export const ENTRY_SECTIONS = [
  "background",
  "education",
  "tech",
  "health",
  "career",
  "volunteering",
  "achievements",
  "leadership",
  "projects_research",
  "community_development",
  "failures_growth",
  "future_goals",
] as const;
export type EntrySection = (typeof ENTRY_SECTIONS)[number];

export interface SectionDefinition {
  key: EntrySection | "documents";
  number: string;
  title: string;
  description: string;
  /** What to record here — shown as guidance and used to focus AI follow-up questions. */
  prompts: string[];
  defaultPrivacy: Privacy;
  /** Entries describe intentions, not accomplishments. */
  futureFacing?: boolean;
  /** Field labels that fit this section. */
  labels: { organisation: string; role: string };
  note?: string;
}

const generic = { organisation: "Organisation", role: "Role" };

export const SECTIONS: SectionDefinition[] = [
  {
    key: "background",
    number: "01",
    title: "My Background",
    description: "Who I am and the experiences that shaped me.",
    prompts: [
      "Personal biography and upbringing",
      "Family background and formative experiences",
      "Hometown, community, and cultural context",
      "Personal values and beliefs",
      "Significant life events and turning points",
      "Challenges, obstacles, and resilience",
      "Motivations, aspirations, and defining moments",
    ],
    defaultPrivacy: "available",
    labels: { organisation: "Place or community", role: "Role or relationship" },
  },
  {
    key: "education",
    number: "02",
    title: "My Educational History",
    description: "My academic journey, from early education to postgraduate ambitions.",
    prompts: [
      "Primary and secondary education",
      "Universities and other institutions attended",
      "Degrees, courses, grades, and GPA",
      "Academic achievements and awards",
      "Scholarships and financial support",
      "Favourite subjects and intellectual interests",
      "Academic challenges and how I overcame them",
      "Research, dissertations, and capstone projects",
      "Lecturers, mentors, and important academic experiences",
      "Future academic goals",
    ],
    defaultPrivacy: "available",
    labels: { organisation: "Institution", role: "Qualification or course" },
  },
  {
    key: "tech",
    number: "03",
    title: "My Tech Story",
    description: "How I discovered technology, developed my skills, and built things.",
    prompts: [
      "How and when I became interested in technology",
      "My first computer, tools, or design experiences",
      "How I learned to code or design",
      "Courses, certifications, and self-learning",
      "Programming languages and technical skills",
      "Design journey and portfolio development",
      "Products and projects I have built",
      "Technical challenges and lessons learned",
      "Startup, freelance, and industry experience",
      "Career milestones and future ambitions in tech",
    ],
    defaultPrivacy: "available",
    labels: { organisation: "Company, course or community", role: "Role" },
  },
  {
    key: "health",
    number: "04",
    title: "My Health Story",
    description: "Personal experiences, observations, and motivations connected to health and healthcare.",
    prompts: [
      "Experiences receiving or supporting care",
      "Experiences witnessing healthcare challenges",
      "Personal encounters with health systems",
      "Healthcare access and affordability experiences",
      "Experiences that shaped my understanding of health equity",
      "Motivation for working on health-related problems",
      "Digital health interests and research",
      "Health-related projects I have built or contributed to",
      "Conversations with patients, practitioners, or institutions",
      "My vision for improving healthcare through technology",
    ],
    defaultPrivacy: "ask",
    labels: { organisation: "Institution or setting", role: "Role" },
    note: "Health details are sensitive. Entries here default to “Ask first”: nothing is sent to the AI until you approve an entry for a specific essay. Mark anything you never want used as Private.",
  },
  {
    key: "career",
    number: "05",
    title: "My CV and Professional Profile",
    description: "A structured, reusable record of my qualifications and professional experience.",
    prompts: [
      "Current CV and previous versions",
      "Work experience and job responsibilities",
      "Professional skills and competencies",
      "Certifications and training",
      "Awards and recognitions",
      "Portfolio and professional links",
      "Quantified achievements",
      "Career goals and preferred roles",
      "Employment timeline",
      "References to supporting documents",
    ],
    defaultPrivacy: "available",
    labels: { organisation: "Employer or organisation", role: "Job title" },
  },
  {
    key: "volunteering",
    number: "06",
    title: "My Volunteering History",
    description: "How I have contributed to communities and causes I care about.",
    prompts: [
      "Organisations and causes supported",
      "Volunteer roles and responsibilities",
      "Community projects and initiatives",
      "Leadership positions",
      "People or communities served",
      "Events organised and activities delivered",
      "Participation figures and measurable impact",
      "Challenges and difficult decisions",
      "Lessons about service, leadership, and empathy",
      "Testimonials, certificates, and supporting evidence",
    ],
    defaultPrivacy: "available",
    labels: { organisation: "Organisation or cause", role: "Volunteer role" },
  },
  {
    key: "achievements",
    number: "07",
    title: "My Achievements and Awards",
    description: "A dedicated record of recognition and accomplishments.",
    prompts: [
      "Scholarships and grants",
      "Academic awards and distinctions",
      "Competitions won and finalist positions",
      "Professional recognition",
      "Leadership accomplishments",
      "Publications and presentations",
      "Selection criteria and award significance",
      "Certificates and verification documents",
    ],
    defaultPrivacy: "available",
    labels: { organisation: "Awarding body", role: "Award or distinction" },
  },
  {
    key: "leadership",
    number: "08",
    title: "My Leadership Story",
    description: "How I take responsibility, influence others, and create change.",
    prompts: [
      "Leadership roles and responsibilities",
      "Teams managed or coordinated",
      "Initiatives started",
      "Decisions made under pressure",
      "Conflicts and how they were resolved",
      "Mentoring and supporting others",
      "Difficult lessons and leadership failures",
      "Results achieved and feedback received",
    ],
    defaultPrivacy: "available",
    labels: generic,
  },
  {
    key: "projects_research",
    number: "09",
    title: "My Projects and Research",
    description: "A deeper record of the work I have created, investigated, or contributed to.",
    prompts: [
      "Project overview and motivation",
      "Problem being addressed",
      "My role and individual contribution",
      "Research and methodology",
      "Tools and technologies used",
      "Stakeholders and collaborators",
      "Results, testing, and validation",
      "Limitations and lessons learned",
      "Reports, prototypes, repositories, and demos",
      "Future development and potential impact",
    ],
    defaultPrivacy: "available",
    labels: { organisation: "Organisation or setting", role: "My role" },
  },
  {
    key: "community_development",
    number: "10",
    title: "My Community and Development Story",
    description: "The problems I have witnessed and the change I want to create.",
    prompts: [
      "Social and economic challenges I have observed",
      "Problems affecting my hometown, country, or region",
      "Experiences that shaped my worldview",
      "Development challenges I care about",
      "Research and evidence that informed my understanding",
      "Solutions I have explored or tested",
      "Communities I hope to serve",
      "Long-term social impact goals",
    ],
    defaultPrivacy: "available",
    labels: { organisation: "Community or region", role: "My involvement" },
  },
  {
    key: "failures_growth",
    number: "11",
    title: "My Failures, Challenges and Growth",
    description: "The setbacks and turning points that reveal how I learn and adapt.",
    prompts: [
      "Major setbacks and disappointments",
      "Opportunities I missed",
      "Projects that failed or underperformed",
      "Mistakes and their consequences",
      "How I responded to rejection",
      "Feedback that changed my approach",
      "Lessons learned and changes made",
      "Examples of persistence and personal growth",
    ],
    defaultPrivacy: "available",
    labels: generic,
  },
  {
    key: "future_goals",
    number: "12",
    title: "My Future Goals and Motivation",
    description: "Where I want to go and why.",
    prompts: [
      "Short-term and long-term goals",
      "Intended career direction",
      "Reasons for pursuing postgraduate study",
      "Problems I want to solve",
      "Skills and knowledge I still need",
      "Preferred programmes and institutions",
      "Plans after graduation",
      "Intended contribution to society",
      "Vision for future ventures and research",
    ],
    defaultPrivacy: "available",
    futureFacing: true,
    labels: { organisation: "Target programme or organisation", role: "Intended role" },
    note: "Everything here is a goal. Drafts always write these as intentions and plans, never as things already done.",
  },
  {
    key: "documents",
    number: "13",
    title: "My Documents and Evidence",
    description: "The source materials that substantiate the rest of my story.",
    prompts: [
      "Certificates and transcripts",
      "Previous CVs and application documents",
      "Essays and personal statements",
      "Research proposals and reports",
      "Recommendation letters",
      "Award letters and official confirmations",
      "Project documentation and portfolio links",
      "Testimonials and performance reviews",
      "Evidence sources linked to individual claims",
    ],
    defaultPrivacy: "available",
    labels: generic,
  },
];

export const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s])) as Record<EntrySection | "documents", SectionDefinition>;

export function sectionTitle(key: string): string {
  return SECTION_BY_KEY[key as EntrySection]?.title ?? key;
}

export function isFutureSection(key: string): boolean {
  return Boolean(SECTION_BY_KEY[key as EntrySection]?.futureFacing);
}

/** Whether the AI may receive an entry for an essay: Private never; Ask first only once approved (linked). */
export function usableByAi(privacy: Privacy, approvedForEssay: boolean): boolean {
  return privacy === "available" || (privacy === "ask" && approvedForEssay);
}
