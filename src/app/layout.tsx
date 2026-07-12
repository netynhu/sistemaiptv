import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Sistema IPTV',
  description: 'Gestão e controle de clientes, revendedores e cobranças',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        {/* Aplica o tema escuro salvo antes da primeira pintura (evita "flash" branco) */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('tema')==='escuro')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
