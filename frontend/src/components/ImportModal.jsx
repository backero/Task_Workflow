import { useState, useRef } from 'react'
import api from '../api/axios'

// type: 'employees' | 'inventory' | 'transactions'
const ImportModal = ({ type, onClose, onDone }) => {
  const [file,      setFile]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState(null)
  const [error,     setError]     = useState('')
  const [dragging,  setDragging]  = useState(false)
  const inputRef = useRef()

  const LABELS = {
    employees:    { title: 'Import Employees',     accept: '.csv,.xlsx,.xls', endpoint: '/import/employees' },
    inventory:    { title: 'Import Inventory',     accept: '.csv,.xlsx,.xls', endpoint: '/import/inventory' },
    transactions: { title: 'Import Transactions',  accept: '.csv,.xlsx,.xls', endpoint: '/import/transactions' },
  }
  const cfg = LABELS[type]

  const pick = (f) => {
    if (!f) return
    setFile(f)
    setResult(null)
    setError('')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) pick(f)
  }

  const downloadTemplate = async () => {
    try {
      const res = await api.get(`/import/template/${type}`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a   = document.createElement('a')
      a.href     = url
      a.download = `${type}-import-template.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* silent */ }
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post(cfg.endpoint, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(data.data.results)
      onDone?.()
    } catch (err) {
      setError(err.response?.data?.message || 'Import failed. Check your file format.')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{cfg.title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Supports CSV and Excel (.xlsx) files</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          {/* Template download */}
          <button
            onClick={downloadTemplate}
            className="w-full flex items-center justify-center gap-2 text-sm text-indigo-600 border border-indigo-200 bg-indigo-50 rounded-xl py-2.5 hover:bg-indigo-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Download Template
          </button>

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-indigo-400 bg-indigo-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
            }`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept={cfg.accept}
              className="hidden"
              onChange={(e) => pick(e.target.files[0])}
            />
            {file ? (
              <>
                <svg className="w-8 h-8 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <p className="text-sm font-medium text-gray-700">{file.name}</p>
                <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              </>
            ) : (
              <>
                <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                <p className="text-sm text-gray-500">Drag & drop or <span className="text-indigo-600 font-medium">browse</span></p>
                <p className="text-xs text-gray-400 mt-1">CSV, XLSX up to 10 MB</p>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2.5 rounded-xl">{error}</div>
          )}

          {/* Result */}
          {result && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1.5">
              <p className="text-sm font-semibold text-green-800">Import Complete</p>
              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div className="bg-white rounded-lg py-2 border border-green-100">
                  <p className="text-lg font-bold text-green-600">{result.created}</p>
                  <p className="text-gray-500">Created</p>
                </div>
                {result.updated !== undefined && (
                  <div className="bg-white rounded-lg py-2 border border-green-100">
                    <p className="text-lg font-bold text-blue-600">{result.updated}</p>
                    <p className="text-gray-500">Updated</p>
                  </div>
                )}
                <div className="bg-white rounded-lg py-2 border border-green-100">
                  <p className="text-lg font-bold text-gray-500">{result.skipped}</p>
                  <p className="text-gray-500">Skipped</p>
                </div>
              </div>
              {result.errors?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-red-600 mb-1">Errors ({result.errors.length}):</p>
                  <div className="max-h-24 overflow-y-auto space-y-0.5">
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded">{e}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-700 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button
                onClick={handleUpload}
                disabled={!file || loading}
                className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Importing…</>
                ) : 'Import'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ImportModal
