# Resume Feed

A community site where people post their resume publicly and others rate, react to,
and critique it. The value is honest feedback from real people in your field, not a
paid review or a black-box ATS score.

> Shared document. An identical copy lives in `resumefeed-frontend/`.
> Decisions that explain _why_ live in `resumefeed-backend/docs/adr/`.

## Language

### The post

**Resume**:
A public feed post: one PDF document plus the metadata shown on its card. The file
itself stays private; the post is the public thing.
_Avoid_: Post, CV, upload

**Owner**:
The person whose resume it is. Exactly one per resume, and never called the author.
_Avoid_: Poster, uploader, author

**Feed**:
The reverse-chronological list of every resume on the site.
_Avoid_: Timeline, stream

### Feedback

**Comment**:
A piece of written feedback on a resume. The unit of critique.
_Avoid_: Review, critique, note

**Reply**:
A comment that answers another comment. A reply is a comment, not a separate kind
of thing.
_Avoid_: Child comment, sub-comment

**Thread**:
A comment together with its replies. A grouping, never a thing that gets created,
named, or stored — a thread exists the moment a comment has a reply, and stops
existing if the replies go away.
_Avoid_: Discussion, conversation, topic

**Author**:
The person who wrote a comment, rating, or reaction. Never the resume's owner.
When a payload carries both, they are `owner` and `author` and they are different
people unless someone is commenting on their own resume.
_Avoid_: Commenter, reviewer, reactor

**Rating**:
A 1-to-5 score on a resume. One per author per resume; scoring again changes the
existing one rather than adding another.
_Avoid_: Score, stars, vote

**Reaction**:
A one-tap response of a fixed kind, left on either a resume or a comment. One per
author per thing reacted to; picking a different kind replaces the previous one.
_Avoid_: Emoji, like
