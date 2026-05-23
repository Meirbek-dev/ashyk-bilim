import { BookOpen, ClipboardList, Code2, FileArchive, FileText, Layers, Video } from 'lucide-react';

export function getActivityIcon(type?: string | null) {
  switch (type) {
    case 'TYPE_VIDEO': {
      return Video;
    }
    case 'TYPE_DOCUMENT': {
      return FileText;
    }
    case 'TYPE_FILE_SUBMISSION': {
      return FileArchive;
    }
    case 'TYPE_EXAM': {
      return ClipboardList;
    }
    case 'TYPE_CODE_CHALLENGE': {
      return Code2;
    }
    case 'TYPE_DYNAMIC': {
      return Layers;
    }
    default: {
      return BookOpen;
    }
  }
}
