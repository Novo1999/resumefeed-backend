# Replies are two levels deep, flattened

`resume_comments.parent_id` looks like an adjacency list that permits arbitrary
nesting, but a trigger rejects any row whose parent itself has a parent: a reply to
a reply is re-parented to the thread's root comment and carries `reply_to_author_id`
so the UI can render "replying to @Sam". We picked this over a full Reddit-style
tree because deep argument chains are the wrong tone for a site selling constructive
critique, and because a fixed depth means no recursive CTEs, bounded page weight, and
replies that paginate with the same cursor helper as everything else.

## Consequences

The `parent_id` column cannot be trusted to describe _who was answered_ — only which
thread a comment belongs to. That is what `reply_to_author_id` is for, and it points
at a Supabase Auth user rather than a comment row, so deleting the answered comment
leaves the label intact rather than dangling.
