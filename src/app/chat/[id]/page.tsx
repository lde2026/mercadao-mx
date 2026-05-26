'use client';

import { use } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import ChatLayout from '@/components/chat/ChatLayout';

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <>
      <Header />
      <main className="min-h-screen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <ChatLayout conversationId={id} />
        </div>
      </main>
      <Footer />
      <MobileBottomNav />
    </>
  );
}
