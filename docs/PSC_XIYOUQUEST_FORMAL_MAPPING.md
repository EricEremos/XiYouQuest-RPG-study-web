# XiYouQuest formal PSC mapping

## Scope and status

This candidate implements a **PSC-format XiYouQuest practice simulation**, not an official PSC examination, result, grade, certification, eligibility decision, or prediction. The formal mock is C1–C5 only. C6 and C7 remain clearly labelled supplementary XiYouQuest drills and do not contribute to a mock-exam score.

## Source traceability

HKUST's supplied `PSC 大綱.docx` points the project to the [2021 PSC implementation outline](https://www.cchatty.com/pdf/4704) and assigned reading-work sources, including [Putonghua reading works](https://www.mandarin.edu.hk/index.php?route=news/news&category=34) and [the reading-work list](https://www.beijingputonghua.com/psc/ldzp/ldzp.htm). The current test format is corroborated by [EduHK's PSC format](https://ccmed.eduhk.hk/zhs/page/detail/527).

| Formal mock component | XiYouQuest contract | Time | Weight | Candidate content rule |
| --- | --- | ---: | ---: | --- |
| C1 读单音节字词 | 100 monosyllabic Chinese characters | 3:30 | 10 | Exactly one Han syllable per item |
| C2 读多音节词语 | 50 two-syllable Chinese words (100 syllables) | 2:30 | 20 | Exactly two Han syllables per item |
| C3 选择判断 | 10 word-choice, 10 measure-word, 5 sentence-order questions | 3:00 | 10 | All three question groups must be complete before database content is used |
| C4 朗读短文 | One scoped reading passage | 4:00 | 30 | Source metadata must record `source_scope: school_provided_public_use`, a title, and a version; text is scoped to the first 400 Han syllables |
| C5 命题说话 | Learner chooses one of two presented topics | 3:00 | 30 | Feedback is a XiYouQuest formative speaking-practice rubric, never an official PSC grade |

## Data and historical-result safeguards

- The mock runner has no unproven hard-coded C4 passage fallback. It blocks starting until a source-verified C4 passage is available in `question_banks`.
- New results use `psc-2021-v2`. Existing four-component results remain interpretable as `psc-2021-v1`; the two score structures are never silently combined.
- The score total is 100 points using the 10/20/10/30/30 component weights. C6/C7 are excluded.
- This document is implementation traceability. It does not replace the school-approved source record that must accompany each C4 passage.
