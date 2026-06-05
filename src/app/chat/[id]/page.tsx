import { ConsoleShell } from "@/components/console/console-shell";

// Deep-linkable conversation: /chat/<sessionId> loads that transcript on mount.
export default async function ChatSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConsoleShell initialSessionId={id} />;
}
