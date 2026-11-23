
import { col, isDuplicateKey } from './db.js';
import { sendMail } from './mailer.js';

const HOUR = 3600000;

/** Deadline as a timestamp. "2026-11-05T09:30:00.000Z" is exact; a plain date means end of that day. */
export const deadlineMs = (d) => (d.includes('T') ? Date.parse(d) : Date.parse(`${d}T23:59:00`));

export const formatDeadline = (d) => fmt(deadlineMs(d));

const fmt = (ms) =>
  new Date(ms).toLocaleString('en-IN', {
    timeZone: process.env.TIMEZONE || 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

/** Supports both new multi-assignee tasks and older single-assignee tasks. */
function taskAssigneeIds(task) {
  const ids = Array.isArray(task.assigneeIds)
    ? task.assigneeIds
    : task.assigneeId
      ? [task.assigneeId]
      : [];

  // Remove duplicate IDs.
  return ids.filter(
    (id, index) =>
      ids.findIndex((other) => String(other) === String(id)) === index
  );
}

/**
 * Email all assignees once when a task enters its "due soon" window
 * (REMINDER_LEAD_HOURS before the deadline, default 48)
 * and once more when it becomes overdue.
 */
export async function runReminders(now = Date.now()) {
  const lead = Number(process.env.REMINDER_LEAD_HOURS || 48) * HOUR;

  const tasks = await col.tasks
    .find({
      reminder: true,
      status: { $ne: 'done' },
      deadline: { $ne: '' },
    })
    .toArray();

  if (!tasks.length) return 0;

  const byId = (docs) =>
    new Map(docs.map((d) => [String(d._id), d]));

  const allAssigneeIds = tasks.flatMap(taskAssigneeIds);
  const uniqueAssigneeIds = allAssigneeIds.filter(
    (id, index) =>
      allAssigneeIds.findIndex((other) => String(other) === String(id)) === index
  );

  const [projects, users] = await Promise.all([
    col.projects
      .find({ _id: { $in: tasks.map((t) => t.projectId) } })
      .toArray(),
    uniqueAssigneeIds.length
      ? col.users.find({ _id: { $in: uniqueAssigneeIds } }).toArray()
      : Promise.resolve([]),
  ]);

  const projectMap = byId(projects);
  const userMap = byId(users);

  let sent = 0;

  for (const task of tasks) {
    const assigneeIds = taskAssigneeIds(task);
    if (!assigneeIds.length) continue;

    const due = deadlineMs(task.deadline);
    if (Number.isNaN(due)) continue;

    const diff = due - now;
    const kind =
      diff < 0
        ? 'overdue'
        : diff <= lead
          ? 'due-soon'
          : null;

    if (!kind) continue;

    const key = {
      taskId: task._id,
      kind,
      deadline: task.deadline,
    };

    // Do not send the same reminder twice for this task/deadline.
    if (await col.reminderLog.findOne(key)) continue;

    const project = projectMap.get(String(task.projectId));
    if (!project) continue;

    const assignees = assigneeIds
      .map((id) => userMap.get(String(id)))
      .filter(Boolean);

    if (!assignees.length) continue;

    const subject =
      kind === 'overdue'
        ? `Overdue: "${task.title}" was due ${fmt(due)}`
        : `Reminder: "${task.title}" is due ${fmt(due)}`;

    const line =
      kind === 'overdue'
        ? `Your task "${task.title}" in project "${project.name}" is overdue. It was due on ${fmt(due)}.`
        : `Your task "${task.title}" in project "${project.name}" is due on ${fmt(due)}.`;

    // Send an individual email to every assigned member.
    for (const assignee of assignees) {
      await sendMail({
        to: assignee.email,
        subject,
        text: `Hi ${assignee.name},\n\n${line}\n\nOpen TaskFlow to update it.\n`,
      });
    }

    // Log only after all recipient emails have been processed.
    try {
      await col.reminderLog.insertOne({
        ...key,
        sentAt: new Date().toISOString(),
      });
    } catch (e) {
      if (!isDuplicateKey(e)) throw e;
    }

    // Count reminder batches, as in the original implementation.
    sent++;
  }

  if (sent) {
    console.log(`[reminders] sent ${sent} reminder(s)`);
  }

  return sent;
}

/** Long-running servers only. On Vercel, a Vercel Cron job calls /api/cron/reminders instead. */
export function startReminderScheduler() {
  const minutes = Number(process.env.REMINDER_INTERVAL_MINUTES || 5);

  setTimeout(() => runReminders().catch(console.error), 5000);

  setInterval(
    () => runReminders().catch(console.error),
    minutes * 60000
  ).unref();
}
