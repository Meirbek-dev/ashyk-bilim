'use client';

import DiscussionList from './discussion-list';

interface CourseDiscussionsProps {
  initialPosts: any[];
  currentUser: any;
  courseUuid: string;
  onMutate?: () => void;
}

export default function CourseDiscussions({ initialPosts, currentUser, courseUuid, onMutate }: CourseDiscussionsProps) {
  return (
    <div className="my-8">
      <DiscussionList
        initialPosts={initialPosts}
        currentUser={currentUser}
        courseUuid={courseUuid}
        onMutate={onMutate}
      />
    </div>
  );
}
