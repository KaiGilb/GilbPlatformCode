// The job outcomes of the workspace: a short success, a failure kept until dismissed.
import { speed } from "./speed";
import { useJobs } from "./hooks";

export function Messages({ ws }: { ws: string }) {
  const { notices, toasts } = useJobs(ws);
  return (
    <div>
      {toasts.map((t) => <p key={t.key} role="status" data-testid="toast">{t.text} <button onClick={() => speed.jobs.dismiss(ws, t.key)}>OK</button></p>)}
      {notices.map((n) => <p key={n.key} role="alert" data-testid="notice">{n.text} <button data-testid="notice-dismiss" onClick={() => speed.jobs.dismiss(ws, n.key)}>Dismiss</button></p>)}
    </div>
  );
}
