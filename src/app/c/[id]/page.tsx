import ChatApp from "@/components/ChatApp";
import { createClient } from "@/lib/supabase/server";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <ChatApp initialConversationId={id} userEmail={user?.email ?? ""} />;
}
