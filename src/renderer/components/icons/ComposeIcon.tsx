import React from 'react';

const ComposeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5H6a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-6" /><path d="m15.5 3.5 5 5M10 14l-1 4 4-1 8-8a2.1 2.1 0 0 0-5-5Z" />
  </svg>
);

export default ComposeIcon;
