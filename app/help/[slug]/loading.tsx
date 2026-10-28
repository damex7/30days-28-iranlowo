export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl" aria-busy="true" aria-label="Loading article">
      <div className="skeleton mb-3 h-4 w-40" />
      <div className="skeleton h-10 w-3/4" />
      <div className="skeleton mt-5 h-72" />
    </div>
  );
}
