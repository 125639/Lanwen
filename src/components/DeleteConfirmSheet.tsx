interface DeleteConfirmSheetProps {
  open: boolean;
  count: number;
  label?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmSheet({
  open,
  count,
  label,
  loading,
  onCancel,
  onConfirm,
}: DeleteConfirmSheetProps) {
  if (!open) {
    return null;
  }

  const title = label ?? `删除 ${count} 个单词`;

  return (
    <div className="modal-backdrop delete-sheet-backdrop" onClick={onCancel}>
      <div className="delete-confirm-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>此操作不可恢复，确认删除？</p>
        <div className="row-buttons">
          <button type="button" className="tap ghost-btn" onClick={onCancel} disabled={loading}>
            取消
          </button>
          <button
            type="button"
            className="tap danger-btn"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}
