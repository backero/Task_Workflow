import {Card as AntCard} from 'antd';
import type React from 'react';

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export default function Card({className, children}: CardProps): React.JSX.Element {
  return <AntCard className={className}>{children}</AntCard>;
}
