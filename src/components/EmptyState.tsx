import {CircleOff} from 'lucide-react';

export function EmptyState({text='لا توجد بيانات كافية للعرض'}:{text?:string}){
  return <div className="empty-state" role="status">
    <div className="empty-icon"><CircleOff size={18}/></div>
    <span>{text}</span>
  </div>;
}
