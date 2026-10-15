import React from 'react';

const EditIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m15 4 5 5M4 20l1-5L16 4a2.8 2.8 0 0 1 4 4L9 19Z" />
  </svg>
);

export default EditIcon;
