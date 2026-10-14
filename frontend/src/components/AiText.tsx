// The AI analysis comes back with light Markdown (headers, **bold**, --- rules, line breaks). Rendering it raw
// shows literal asterisks/hashes; this handles just those - no need for a full Markdown library.
function inline(line: string, keyPrefix: number) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={`${keyPrefix}-${j}`}>{part.slice(2, -2)}</strong>
      : part,
  )
}

const HEADER_CLASS: Record<number, string> = { 1: 'text-base font-bold', 2: 'text-sm font-bold', 3: 'text-sm font-semibold' }

export default function AiText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').filter((line) => line.trim() !== '').map((line, i) => {
        if (/^---+$/.test(line.trim())) return <hr key={i} className="my-2 border-sand" />
        const h = line.match(/^(#{1,3})\s+(.*)/)
        if (h) return <span key={i} className={`mt-2 block first:mt-0 ${HEADER_CLASS[h[1].length]}`}>{inline(h[2], i)}</span>
        return <span key={i} className="mt-1 block first:mt-0">{inline(line, i)}</span>
      })}
    </>
  )
}
