import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shopistan · Online stores built for Pakistan',
  description: 'Open your online store with a one-step Cash on Delivery order form and WhatsApp order confirmation built in.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white">{children}</body>
    </html>
  );
}
