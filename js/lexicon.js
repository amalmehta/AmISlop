// Phrase lists the rules engine looks for.
// These are curated by hand, not learned from data. Sources that shaped them:
//  - Plain-language guidance: plainlanguage.gov "Federal Plain Language Guidelines" (2011),
//    sections "Omit excess words" and "Use simple words and phrases".
//  - Hedging: Hyland, K. (1998) "Hedging in Scientific Research Articles", John Benjamins.
//  - Strunk & White, "The Elements of Style", rule 13 "Omit needless words".
// Each entry: [phrase, suggestion]. A phrase is matched as whole words, case-insensitive.
// "~" in a phrase matches an optional apostrophe form (you're / youre).

export const PADDING = [
  ["i hope this (email|message|note) finds you well", "cut it"],
  ["hope you('re| are) (doing )?well", "cut it"],
  ["i (just )?wanted to (reach out|check in|follow up|touch base|circle back)( on| about| regarding)?", "say the thing directly"],
  ["(just )?wanted to (reach out|check in|follow up|touch base|circle back)( on| about| regarding)?", "say the thing directly"],
  ["i just wanted to", "cut it"],
  ["just wanted to", "cut it"],
  ["circle back", "follow up, or cut it"],
  ["touch base", "talk"],
  ["reach out", "ask / write"],
  ["as you (may )?know", "cut it"],
  ["as (i )?(previously )?mentioned", "cut it"],
  ["needless to say", "cut it"],
  ["it goes without saying( that)?", "cut it"],
  ["for what it'?s worth", "cut it"],
  ["at the end of the day", "cut it"],
  ["in order to", "to"],
  ["due to the fact that", "because"],
  ["owing to the fact that", "because"],
  ["in light of the fact that", "because"],
  ["despite the fact that", "although"],
  ["the fact that", "that"],
  ["at this point in time", "now"],
  ["at the present time", "now"],
  ["in the event that", "if"],
  ["in the near future", "soon (or a date)"],
  ["for all intents and purposes", "cut it"],
  ["with (regard|regards|respect) to", "about"],
  ["in terms of", "in / for"],
  ["going forward", "cut it"],
  ["moving forward", "cut it"],
  ["(please )?(let me know|feel free to reach out) if you have any (questions|concerns)", "cut it, or ask one real question"],
  ["(please )?(don'?t|do not) hesitate to", "cut it"],
  ["feel free to", "cut it"],
  ["to be honest", "cut it"],
  ["(i )?just to clarify", "cut it"],
  ["it is important to note that", "cut it"],
  ["it should be noted that", "cut it"],
  ["basically", "cut it"],
  ["essentially", "cut it"],
  ["actually", "cut it"],
  ["literally", "cut it"],
  ["really", "cut it"],
  ["very", "cut it, or use a stronger word"],
  ["quite", "cut it"],
  ["totally", "cut it"],
  ["honestly", "cut it"],
];

export const HEDGES = [
  ["i (was )?(just )?wondering if", "ask directly"],
  ["would it be possible (to|for)", "can you / can we"],
  ["i('m| am) not (sure|certain)( if| whether| but)?", "say what you know, then what you don't"],
  ["not sure (if|whether|but)", "say what you know, then what you don't"],
  ["if that makes sense", "cut it"],
  ["does that make sense", "cut it"],
  ["sorry to bother( you)?", "cut it"],
  ["just a thought", "cut it"],
  ["i feel like", "say it as a claim"],
  ["i think", "cut it, or give the reason"],
  ["i believe", "cut it, or give the reason"],
  ["i guess", "cut it"],
  ["i suppose", "cut it"],
  ["it seems( like)?", "say it, or say what's uncertain"],
  ["seems like", "say it, or say what's uncertain"],
  ["it appears( that)?", "say it, or say what's uncertain"],
  ["kind of", "cut it"],
  ["sort of", "cut it"],
  ["a little bit", "cut it"],
  ["somewhat", "cut it"],
  ["could possibly", "could"],
  ["may be able to", "can"],
  ["or something", "cut it"],
  ["maybe", "decide, or say what it depends on"],
  ["perhaps", "decide, or say what it depends on"],
  ["possibly", "decide, or say what it depends on"],
  ["potentially", "decide, or say what it depends on"],
  ["probably", "give the odds or the reason"],
  ["hopefully", "say the plan"],
  ["might", "will / won't, or say what it depends on"],
  ["just", "cut it"],
  ["sorry", "cut it"],
];

export const VAGUE = [
  ["at some point", "give a date"],
  ["some point", "give a date"],
  ["and so on", "list them, or cut it"],
  ["and stuff", "name it"],
  ["something like that", "name it"],
  ["a bunch of", "give the number"],
  ["lots of", "give the number"],
  ["a lot of", "give the number"],
  ["a few", "give the number"],
  ["a bit", "say how much"],
  ["things", "name them"],
  ["thing", "name it"],
  ["stuff", "name it"],
  ["various", "name them"],
  ["etc", "list them, or cut it"],
  ["soon", "give a date"],
  ["somehow", "say how"],
  ["someone", "name them"],
  ["somewhere", "say where"],
];

// Markers that start a new, unrelated point. Flagged only mid-paragraph.
export const TOPIC_SHIFTS = [
  "oh and", "oh also", "also", "btw", "by the way", "another thing", "one more thing",
  "separately", "unrelated", "unrelatedly", "on another note", "on a different note",
  "on a separate note", "side note", "random but", "ps", "p\\.s\\.", "anyway", "anyways",
];

// Words that make a sentence an assertion that wants a reason.
export const CLAIMS = [
  "should", "must", "need to", "needs to", "have to", "has to", "clearly", "obviously",
  "definitely", "certainly", "always", "never", "everyone", "nobody", "no one",
  "the best", "the worst", "the only", "is wrong", "are wrong", "is broken", "won'?t work",
  "will fail", "doesn'?t work", "is better", "is worse", "makes no sense",
];

// Words that signal a reason or evidence is attached.
export const REASONS = [
  "because", "since", "so that", "due to", "given", "as a result", "which means", "otherwise",
  "e\\.g\\.", "for example", "for instance", "data", "shows?", "showed", "measured", "tested",
  "if", "when", "so", "therefore", "the reason", "that's why", "to avoid", "to keep",
];

export const FORMAL = [
  "furthermore", "moreover", "hence", "thus", "therefore", "regarding", "pursuant to",
  "please be advised", "kindly", "per our", "herewith", "aforementioned", "in accordance with",
  "henceforth", "whereby", "i am writing to", "dear", "sincerely", "best regards", "kind regards",
  "respectfully", "accordingly", "notwithstanding",
];

export const CASUAL = [
  "hey", "hiya", "yo", "lol", "lmao", "haha+", "gonna", "wanna", "gotta", "yeah", "yep", "nope",
  "kinda", "sorta", "btw", "omg", "tbh", "imo", "super", "awesome", "cool", "dude", "y'?all",
  "u", "ya", "ok+", "nah",
];
