import React from 'react';

import { getFileTypeInfo } from '.';

interface FileTypeIconProps {
  fileName: string;
  className?: string;
  monochrome?: boolean;
}

/**
 * Renders the appropriate file-type icon for the given file name.
 * Wraps the icon in a span that applies the category-specific color,
 * or allows inheriting currentColor when monochrome is true.
 */
const FileTypeIcon: React.FC<FileTypeIconProps> = ({ fileName, className, monochrome = false }) => {
  const { icon: Icon, color } = getFileTypeInfo(fileName);
  return (
    <span style={monochrome ? undefined : { color }}>
      <Icon className={className} />
    </span>
  );
};

export default FileTypeIcon;