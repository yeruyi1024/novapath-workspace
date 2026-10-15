import './previewFileBreadcrumb.css';

import { ChevronRightIcon, FolderIcon } from '@heroicons/react/24/outline';

import { getPreviewFileLocation } from '@/services/previewFileLocation';

interface PreviewFileBreadcrumbProps {
  filePath?: string;
  label: string;
}

export default function PreviewFileBreadcrumb({ filePath, label }: PreviewFileBreadcrumbProps) {
  const location = getPreviewFileLocation(filePath);
  return (
    <div className="preview-file-breadcrumb flex min-w-0 flex-1 items-center gap-1.5 text-xs [container-type:inline-size]" title={location?.path || label}>
      {location?.folder && (
        <>
          <FolderIcon className="preview-file-breadcrumb__parent h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span className="preview-file-breadcrumb__parent max-w-[30%] truncate text-secondary">{location.folder}</span>
          <ChevronRightIcon className="preview-file-breadcrumb__parent h-3 w-3 shrink-0 text-muted" aria-hidden="true" />
        </>
      )}
      <span className="min-w-0 truncate font-medium text-foreground">{label}</span>
    </div>
  );
}
