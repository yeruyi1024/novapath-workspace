import React from 'react';

const DefaultAgentIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="16 16 96 96" fill="none" aria-hidden="true">
    <path d="M82 25C86 36 91 41 102 45C91 49 86 54 82 65C78 54 73 49 62 45C73 41 78 36 82 25Z" fill="currentColor" />
    <path d="M35 47C21 63 28 86 47 93C65 100 91 91 97 72M31 76C44 77 57 68 65 59" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
  </svg>
);

export default DefaultAgentIcon;
