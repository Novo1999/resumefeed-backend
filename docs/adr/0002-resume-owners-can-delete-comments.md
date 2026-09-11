# Resume owners can delete comments on their own post

A comment can be deleted by its author or by the owner of the resume it sits on, and
the deletion leaves no visible trace. A public resume is PII — real name, email,
phone number, employer — so the owner needs an escape hatch against abuse or doxxing
that does not depend on a moderation queue we have not built.

## Consequences

This is a deliberate hole in the site's central promise. An owner can silently remove
the one honest critique they did not like, and nothing in the feed marks that it
happened, so a post with no criticism is not evidence that none was offered. We chose
this over author-only deletion because the PII exposure is immediate and concrete
while the trust erosion is gradual, and over a visible "[removed by the resume owner]"
tombstone because that publicly brands the owner for exercising a right we gave them.
Revisit when moderation gets a real home.

A deleted comment that has replies is tombstoned rather than removed, because the
replies belong to other people: the row keeps its ID and children, blanks its body,
and sets `deleted_at`. A comment nobody answered is deleted outright. Tombstones are
excluded from `resumes.comment_count`, so the feed card only ever promises comments a
viewer can actually read.
