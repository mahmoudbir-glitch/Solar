'use client';

import {usePathname} from 'next/navigation';
import {Nav,Header} from '@/components/Nav';

export function AppShell({children}:{children:React.ReactNode}){
 const pathname=usePathname();
 if(pathname==='/login') return <>{children}</>;
 return <><div className="shell"><Header/><main>{children}</main></div><Nav/></>;
}
