import ChatApp from "@/components/ChatApp";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <ChatApp initialConversationId={null} userEmail={user?.email ?? ""} />;
}
