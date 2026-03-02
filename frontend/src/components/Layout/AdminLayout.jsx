const AdminLayout = ({ title, children }) => {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold theme-text">{title}</h1>

      <div className="space-y-6">{children}</div>
    </div>
  );
};

export default AdminLayout;
