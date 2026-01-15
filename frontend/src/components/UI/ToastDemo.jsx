import { useToast } from '../../contexts/ToastContext'
import Button from './Button'

const ToastDemo = () => {
  const { showToast } = useToast()

  return (
    <div className="p-8 space-y-4">
      <h2 className="text-2xl font-bold text-[var(--theme-text)] mb-4">
        Toast Notification Demo
      </h2>
      
      <div className="flex flex-wrap gap-4">
        <Button
          variant="success"
          onClick={() => showToast('Operation completed successfully!', 'success')}
        >
          Show Success Toast
        </Button>
        
        <Button
          variant="danger"
          onClick={() => showToast('An error occurred. Please try again.', 'error')}
        >
          Show Error Toast
        </Button>
        
        <Button
          variant="primary"
          onClick={() => showToast('This is an informational message.', 'info')}
        >
          Show Info Toast
        </Button>
        
        <Button
          variant="outline"
          onClick={() => showToast('Warning: Please review your input.', 'warning')}
        >
          Show Warning Toast
        </Button>
        
        <Button
          variant="secondary"
          onClick={() => showToast('This toast will stay for 10 seconds', 'info', 10000)}
        >
          Show Long Duration Toast
        </Button>
      </div>
    </div>
  )
}

export default ToastDemo
