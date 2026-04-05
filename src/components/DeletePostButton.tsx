import { actions } from 'astro:actions';
import { Button } from './ui/button';
import { useState } from 'react';

export default function DeletePostButton({ slug }: { slug: string }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    console.log("deleting");
    if (!confirm('Are you sure you want to delete this post?')) return;
    
    setIsDeleting(true);
    try {
      const { data, error } = await actions.deletePost({ slug });
      if (error) {
        alert('Failed to delete post: ' + error.message);
      } else {
        alert('Post deleted successfully (fake)!');
        window.location.reload();
      }
    } catch (e) {
      alert('An error occurred.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Button 
      variant="destructive" 
      size="sm" 
      onClick={handleDelete} 
      disabled={isDeleting}
    >
      {isDeleting ? 'Deleting...' : 'Delete'}
    </Button>
  );
}
