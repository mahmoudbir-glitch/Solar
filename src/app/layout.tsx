import './globals.css';import {Nav,Header} from '@/components/Nav';
export const metadata={title:'Solar | مراقبة الطاقة الشمسية',description:'مراقبة منظومة الطاقة الشمسية'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body><div className="shell"><Header/><main>{children}</main></div><Nav/></body></html>}
