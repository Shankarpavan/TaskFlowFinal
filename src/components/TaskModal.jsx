
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { act } from '../store/tasksSlice.js';
import { selectForecastByDate } from '../store/weatherSlice.js';
import { PRIORITIES, uid, toInputValue, fromInputValue } from '../utils/helpers.js';
import Comments from './Comments.jsx';

export default function TaskModal({ project, task, onClose }) {
  const dispatch = useDispatch();
  const editing = Boolean(task);

  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    assignees: task?.assignees ?? (task?.assignee ? [task.assignee] : []),
    deadline: toInputValue(task?.deadline),
    priority: task?.priority ?? 'Medium',
    reminder: task?.reminder ?? true,
    subtasks: task?.subtasks ?? [],
  });

  const [subTitle, setSubTitle] = useState('');

  const forecast = useSelector((s) =>
    selectForecastByDate(s, form.deadline.slice(0, 10))
  );

  const set = (key) => (e) =>
    setForm({
      ...form,
      [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    });

  const toggleAssignee = (memberId) => {
    setForm((current) => ({
      ...current,
      assignees: current.assignees.includes(memberId)
        ? current.assignees.filter((id) => id !== memberId)
        : [...current.assignees, memberId],
    }));
  };

  const addSub = () => {
    if (!subTitle.trim()) return;

    setForm({
      ...form,
      subtasks: [
        ...form.subtasks,
        { id: uid(), title: subTitle.trim(), done: false },
      ],
    });

    setSubTitle('');
  };

  const removeSub = (id) =>
    setForm({
      ...form,
      subtasks: form.subtasks.filter((s) => s.id !== id),
    });

  const save = async (e) => {
    e.preventDefault();

    if (!form.title.trim()) return;

    const data = {
      ...form,
      title: form.title.trim(),
      deadline: fromInputValue(form.deadline),
    };

    const ok = editing
      ? await dispatch(
          act({
            type: 'UPDATE_TASK',
            id: task.id,
            changes: data,
          })
        )
      : await dispatch(
          act({
            type: 'ADD_TASK',
            task: {
              ...data,
              projectId: project.id,
            },
          })
        );

    if (ok) onClose();
  };

  const remove = async () => {
    if (await dispatch(act({ type: 'DELETE_TASK', id: task.id }))) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-ink/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={save}
        className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
      >
        <h2 className="font-display text-lg font-bold">
          {editing ? 'Edit task' : 'New task'}
        </h2>

        <label className="block text-sm">
          Title
          <input
            className="field mt-1"
            value={form.title}
            onChange={set('title')}
            required
            autoFocus
          />
        </label>

        <label className="block text-sm">
          Description
          <textarea
            className="field mt-1"
            rows={2}
            value={form.description}
            onChange={set('description')}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <fieldset className="col-span-2">
            <legend className="text-sm font-medium">
              Assign to multiple members
            </legend>

            <div className="mt-2 max-h-36 space-y-2 overflow-y-auto rounded border border-slate-200 p-3">
              {project.members.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No project members available.
                </p>
              ) : (
                project.members.map((member) => (
                  <label
                    key={member.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={form.assignees.includes(member.id)}
                      onChange={() => toggleAssignee(member.id)}
                    />
                    {member.name}
                  </label>
                ))
              )}
            </div>

            <p className="mt-1 text-xs text-slate-500">
              {form.assignees.length === 0
                ? 'No one assigned'
                : `${form.assignees.length} member${form.assignees.length === 1 ? '' : 's'} assigned`}
            </p>
          </fieldset>

          <label className="col-span-2 block text-sm">
            Deadline (date and time)
            <input
              type="datetime-local"
              className="field mt-1"
              value={form.deadline}
              onChange={set('deadline')}
            />
          </label>

          <label className="block text-sm">
            Priority
            <select
              className="field mt-1"
              value={form.priority}
              onChange={set('priority')}
            >
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>

          {forecast && (
            <p
              role="status"
              className="col-span-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900"
            >
              Forecast for that day: {forecast.summary}, {forecast.min}&deg;/
              {forecast.max}&deg;C
              {forecast.rainChance >= 50
                ? `, ${forecast.rainChance}% chance of rain. Plan outdoor work accordingly.`
                : '.'}
            </p>
          )}

          <label className="mt-6 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.reminder}
              onChange={set('reminder')}
            />
            Remind me before the deadline
          </label>
        </div>

        <fieldset>
          <legend className="text-sm">Subtasks</legend>

          <ul className="mt-1 space-y-1">
            {form.subtasks.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-sm"
              >
                {s.title}
                <button
                  type="button"
                  className="text-xs text-alert"
                  onClick={() => removeSub(s.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-2 flex gap-2">
            <input
              className="field"
              placeholder="Add a subtask"
              value={subTitle}
              onChange={(e) => setSubTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addSub();
                }
              }}
            />
            <button
              type="button"
              className="btn-ghost"
              onClick={addSub}
            >
              Add
            </button>
          </div>
        </fieldset>

        {editing && <Comments taskId={task.id} />}

        <div className="flex items-center justify-between pt-2">
          {editing ? (
            <button
              type="button"
              className="text-sm text-alert"
              onClick={remove}
            >
              Delete task
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
            >
              Cancel
            </button>

            <button type="submit" className="btn-primary">
              {editing ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
