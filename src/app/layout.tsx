import './globals.css';
import {AppShell} from '@/components/AppShell';

export const metadata={title:'Solar | مراقبة الطاقة الشمسية',description:'مراقبة منظومة الطاقة الشمسية'};

export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="ar" dir="rtl"><body><AppShell>{children}</AppShell></body></html>
}
