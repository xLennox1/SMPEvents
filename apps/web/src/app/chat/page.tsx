import { ChatClient, type ChatMessage } from '@/components/chat-client';
import { PageHeader } from '@/components/page-bits';
import { requireViewer } from '@/lib/auth';

export const metadata = { title: 'SMPEvents Chatall' };

export default async function ChatPage() {
  const { supabase, viewer } = await requireViewer('/chat');
  const { data } = await supabase.from('chat_messages').select('id,user_id,body,created_at,edited_at,author:profiles(username,avatar_url,role)').order('created_at', { ascending: false }).limit(50);
  const initial = ((data ?? []) as unknown as ChatMessage[]).reverse();
  return (
    <>
      <PageHeader title="SMPEvents Chatall" description="Der gemeinsame Chat für alle registrierten Spieler. Sei freundlich, kein Spam, keine Werbung." />
      <ChatClient initial={initial} viewerId={viewer.id} viewerRole={viewer.role} />
    </>
  );
}
