import { useEffect, useRef } from 'react';

export default function ProductCatalogHTML() {
  const iframeRef = useRef(null);

  useEffect(() => {
    const resize = () => {
      if (iframeRef.current) {
        const top = iframeRef.current.getBoundingClientRect().top;
        iframeRef.current.style.height = `${window.innerHeight - top}px`;
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src="/product-catalog.html"
      title="Product Catalog"
      className="w-full border-0 block"
      style={{ minHeight: '600px' }}
    />
  );
}
