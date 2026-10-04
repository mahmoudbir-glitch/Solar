import './globals.css';import {Nav} from '@/components/Nav';
export const metadata={title:'Solar',description:'مراقبة منظومة Felicitysolar'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body><main className="mx-auto min-h-screen max-w-5xl px-4 pb-24 pt-6">{children}</main><Nav/></body></html>}