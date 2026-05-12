export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer mt-20 px-4 py-8 text-subtle">
      <div className="page-wrap flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-[13px] tracking-wide">&copy; {year} AI Dev Tools</p>
        <p className="m-0 text-[12px] tracking-wide text-subtle">Built with TanStack Start</p>
      </div>
    </footer>
  )
}
