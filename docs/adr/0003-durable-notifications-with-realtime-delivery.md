# Durable notifications with realtime delivery

Notifications are persisted with the feedback or initial-rating event that creates
them, and Supabase Realtime delivers new notification records to their recipient.
Persisting first makes pagination, unread state, history, and offline recipients
reliable; Realtime is the live-delivery mechanism rather than the notification
source of truth. Database access is recipient-scoped: browser clients can read and
subscribe only to their own notifications, and cannot create them.

PostgreSQL triggers create notifications from the feedback and initial-rating rows,
so their creation is atomic with the underlying activity and cannot be skipped by a
future write path. Updates do not create notifications; removing a reaction marks
its linked historical notification as removed.
