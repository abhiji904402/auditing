import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Check, AlertTriangle, Search, Trash2, Plus, X, 
  HelpCircle, ArrowRight, Loader2, RefreshCw 
} from 'lucide-react';
import { db, setDoc, doc } from '../lib/firebase';

export interface ReviewRow {
  id: string;
  originalText: string;
  amount: number;
  matchedItemId: string;
  isMatched: boolean;
  include: boolean;
}

interface Item {
  id: string;
  name: string;
  category: string;
  barcode?: string;
  status?: string;
}

interface AIBulkReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  parsedReviewRows: ReviewRow[];
  setParsedReviewRows: React.Dispatch<React.SetStateAction<ReviewRow[]>>;
  onConfirm: (finalRows: ReviewRow[]) => void;
  bulkMode: string;
  addNotification: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const CATEGORIES_LIST = [
  'Beverages',
  'Breads',
  'Cake Jars',
  'Cheese Cakes',
  'Chips/Namkeens',
  'Chocolates',
  'Classic Cakes',
  'Cookies & Snacks',
  'Customised Cakes',
  'Decorations',
  'Dry Fruits & Dry Cakes',
  'Exotic Cakes',
  'Fries & Nachos',
  'Garlic Bread',
  'Gift Packs & Hampers',
  'Others',
  'Pastries',
  'Pizza',
  'Savouries & Snacks',
  'Shakes'
];

export const AIBulkReviewModal: React.FC<AIBulkReviewModalProps> = ({
  isOpen,
  onClose,
  items,
  setItems,
  parsedReviewRows,
  setParsedReviewRows,
  onConfirm,
  bulkMode,
  addNotification,
}) => {
  const [activeSearchRowId, setActiveSearchRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [registerRowId, setRegisterRowId] = useState<string | null>(null);
  const [registerName, setRegisterName] = useState('');
  const [registerCategory, setRegisterCategory] = useState('Others');
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [registerError, setRegisterError] = useState('');

  const activeItems = useMemo(() => items.filter(i => i.status !== 'inactive'), [items]);

  // Handle outside click to close dropdowns
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveSearchRowId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  if (!isOpen) return null;

  // Search/Filter items for specific row
  const filteredCatalogItems = useMemo(() => {
    if (!searchQuery.trim()) {
      return activeItems.slice(0, 8);
    }
    const q = searchQuery.toLowerCase();
    return activeItems
      .filter(item => item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q))
      .slice(0, 8);
  }, [activeItems, searchQuery]);

  const handleRowCheckToggle = (rowId: string) => {
    setParsedReviewRows(prev => prev.map(r => r.id === rowId ? { ...r, include: !r.include } : r));
  };

  const handleRowAmountChange = (rowId: string, amount: number) => {
    setParsedReviewRows(prev => prev.map(r => r.id === rowId ? { ...r, amount: Math.max(0, amount) } : r));
  };

  const handleRowProductSelect = (rowId: string, item: Item | null) => {
    setParsedReviewRows(prev => prev.map(r => {
      if (r.id === rowId) {
        return {
          ...r,
          matchedItemId: item ? item.id : '',
          isMatched: !!item
        };
      }
      return r;
    }));
    setActiveSearchRowId(null);
    setSearchQuery('');
  };

  const handleRowDelete = (rowId: string) => {
    setParsedReviewRows(prev => prev.filter(r => r.id !== rowId));
  };

  const openRegisterNewProduct = (rowId: string, originalText: string) => {
    setRegisterRowId(rowId);
    setRegisterName(originalText.toUpperCase());
    setRegisterCategory('Others');
    setRegisterError('');
    setShowRegisterForm(true);
  };

  const handleConfirmRegister = async () => {
    if (!registerName.trim()) {
      setRegisterError('Product name cannot be empty.');
      return;
    }
    setIsSavingProduct(true);
    setRegisterError('');

    try {
      const id = Date.now().toString();
      const newItem: Item = {
        id,
        name: registerName.trim().toUpperCase(),
        category: registerCategory,
        barcode: 'BR' + id.substring(6)
      };

      // Save to Firebase (durable storage)
      await setDoc(doc(db, 'items', newItem.id), newItem);

      // Add to main catalog state
      setItems(prev => [...prev, newItem]);

      // Map to current row
      if (registerRowId) {
        handleRowProductSelect(registerRowId, newItem);
      }

      setShowRegisterForm(false);
      setRegisterRowId(null);
      addNotification(`REGISTERED & MATCHED: ${newItem.name}`, 'success');
    } catch (err: any) {
      console.error("Failed to register item:", err);
      setRegisterError(err.message || 'Firestore write failed. Please retry.');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleApplyAll = () => {
    const includedRows = parsedReviewRows.filter(r => r.include);
    
    // Check if any included row doesn't have a valid match
    const unmatchedCount = includedRows.filter(r => !r.isMatched || !r.matchedItemId).length;
    if (unmatchedCount > 0) {
      addNotification(`Please pair or uncheck the ${unmatchedCount} unmatched rows before applying.`, 'warning');
      return;
    }

    if (includedRows.length === 0) {
      addNotification("No rows included to save.", 'warning');
      return;
    }

    onConfirm(includedRows);
  };

  return (
    <div className="fixed inset-0 bg-[#4F2C1D]/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[#FAF8F5] border-2 border-[#4F2C1D] w-full max-w-5xl h-[85vh] max-h-[780px] shadow-[16px_16px_0_0_rgba(79,44,29,0.15)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b-2 border-[#4F2C1D] bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-50 text-[#4F2C1D] border border-amber-200 rounded-lg">
              <Sparkles size={24} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-brand-serif italic font-black text-[#4F2C1D] flex items-center gap-2">
                AI Data Entry Review Board
              </h2>
              <p className="text-[9px] font-black uppercase tracking-wider text-stone-500 flex items-center gap-1">
                <span>Refining {parsedReviewRows.length} entries for metric:</span>
                <span className="bg-[#4F2C1D] text-white px-1.5 py-0.5 rounded font-mono font-black text-[8px]">
                  {bulkMode.toUpperCase()}
                </span>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={onClose}
              className="p-1.5 border border-stone-200 hover:border-[#4F2C1D] text-stone-500 hover:text-[#4F2C1D] transition-colors rounded"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-amber-50 border-b border-amber-200/60 px-6 py-2.5 text-[10px] text-amber-800 font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={13} className="shrink-0" />
            <span>Verify matched products and quantities below. Tap any product box to search/re-pair.</span>
          </div>
          <div className="hidden md:flex gap-4">
            <span>Total Rows: {parsedReviewRows.length}</span>
            <span className="text-green-800">Ready: {parsedReviewRows.filter(r => r.isMatched && r.include).length}</span>
            <span className="text-red-800">Unmatched: {parsedReviewRows.filter(r => !r.isMatched && r.include).length}</span>
          </div>
        </div>

        {/* Table / Grid Container */}
        <div className="flex-1 overflow-y-auto p-6" ref={dropdownRef}>
          <div className="border-2 border-[#4F2C1D] rounded overflow-hidden bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50 border-b-2 border-[#4F2C1D] font-black uppercase text-[10px] text-stone-600">
                  <th className="p-3 text-center w-12">Use</th>
                  <th className="p-3 w-48">Your Input Line</th>
                  <th className="p-3 w-72">Matched Catalog Product</th>
                  <th className="p-3 text-center w-28">Quantity</th>
                  <th className="p-3 text-center w-12">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {parsedReviewRows.map((row, idx) => {
                  const isRowActive = activeSearchRowId === row.id;
                  const matchedItem = activeItems.find(i => i.id === row.matchedItemId);

                  return (
                    <tr 
                      key={row.id} 
                      className={`hover:bg-stone-50/50 transition-colors ${!row.include ? 'opacity-40 bg-stone-100/50' : ''}`}
                    >
                      {/* Checkbox Include */}
                      <td className="p-3 text-center">
                        <input 
                          type="checkbox"
                          checked={row.include}
                          onChange={() => handleRowCheckToggle(row.id)}
                          className="h-4 w-4 rounded border-stone-300 text-[#4F2C1D] focus:ring-[#4F2C1D]"
                        />
                      </td>

                      {/* Original Input Text */}
                      <td className="p-3 font-brand-mono font-bold text-stone-600 uppercase break-all">
                        {row.originalText}
                      </td>

                      {/* Product Selector Dropdown */}
                      <td className="p-3 relative">
                        {row.include ? (
                          <div>
                            {/* Selector Trigger Button */}
                            <div 
                              onClick={() => {
                                setActiveSearchRowId(isRowActive ? null : row.id);
                                setSearchQuery(matchedItem ? matchedItem.name : '');
                              }}
                              className={`w-full p-2.5 border rounded flex items-center justify-between cursor-pointer transition-all ${
                                row.isMatched 
                                  ? 'border-green-300 bg-green-50/20 hover:bg-green-50/45 text-green-900' 
                                  : 'border-amber-400 bg-amber-50/30 hover:bg-amber-50/60 text-amber-900'
                              }`}
                            >
                              <div className="truncate flex-1 pr-2">
                                {row.isMatched && matchedItem ? (
                                  <div className="flex items-center gap-1.5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-green-600"></span>
                                    <span className="font-bold uppercase text-[11px]">{matchedItem.name}</span>
                                    <span className="text-[9px] bg-green-100 text-green-800 px-1 py-0.2 rounded uppercase tracking-tighter">
                                      {matchedItem.category}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 font-bold italic text-[11px] text-amber-700">
                                    <AlertTriangle size={12} />
                                    <span>Pair Product...</span>
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] text-stone-400 font-bold uppercase shrink-0">
                                {isRowActive ? 'Close' : 'Edit'}
                              </span>
                            </div>

                            {/* Suggestions Dropdown Card */}
                            <AnimatePresence>
                              {isRowActive && (
                                <motion.div 
                                  initial={{ opacity: 0, y: 5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 5 }}
                                  className="absolute left-3 right-3 top-full mt-1 bg-white border-2 border-[#4F2C1D] shadow-xl z-50 rounded overflow-hidden max-h-56 flex flex-col"
                                >
                                  {/* Filter input */}
                                  <div className="p-2 border-b border-stone-200 bg-stone-50 flex items-center gap-2">
                                    <Search size={14} className="text-stone-400" />
                                    <input 
                                      type="text"
                                      autoFocus
                                      placeholder="Filter product catalog..."
                                      value={searchQuery}
                                      onChange={(e) => setSearchQuery(e.target.value)}
                                      className="w-full bg-transparent focus:outline-none text-[11px] font-bold uppercase text-stone-700"
                                    />
                                    {searchQuery && (
                                      <button onClick={() => setSearchQuery('')} className="text-[9px] text-stone-400 hover:text-stone-600">
                                        Clear
                                      </button>
                                    )}
                                  </div>

                                  {/* Suggestion Options list */}
                                  <div className="overflow-y-auto divide-y divide-stone-100 max-h-40">
                                    {filteredCatalogItems.map(item => (
                                      <button
                                        type="button"
                                        key={item.id}
                                        onClick={() => handleRowProductSelect(row.id, item)}
                                        className="w-full text-left px-3 py-2 text-[11px] hover:bg-[#4F2C1D]/5 hover:text-[#4F2C1D] flex items-center justify-between font-bold"
                                      >
                                        <div className="truncate">
                                          <div className="uppercase text-stone-800 font-bold">{item.name}</div>
                                          <div className="text-[8px] uppercase tracking-wider text-stone-400">{item.category}</div>
                                        </div>
                                        <ArrowRight size={10} className="opacity-0 group-hover:opacity-100" />
                                      </button>
                                    ))}
                                    {filteredCatalogItems.length === 0 && (
                                      <div className="p-4 text-center text-stone-400 italic text-[10px]">
                                        No items matching search query.
                                      </div>
                                    )}
                                  </div>

                                  {/* Quick Action inside dropdown to register missing item */}
                                  <div className="p-2 bg-stone-50 border-t border-stone-100 flex justify-between items-center gap-1">
                                    <span className="text-[8px] text-stone-400 uppercase font-black">Missing Item?</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveSearchRowId(null);
                                        openRegisterNewProduct(row.id, row.originalText);
                                      }}
                                      className="text-[9px] font-black uppercase text-[#4F2C1D] hover:underline flex items-center gap-1 shrink-0"
                                    >
                                      <Plus size={10} /> Register New Cake
                                    </button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ) : (
                          <div className="text-stone-400 italic">Excluded from entry</div>
                        )}
                      </td>

                      {/* Amount/Quantity Input */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center">
                          <input 
                            type="text"
                            disabled={!row.include}
                            value={row.amount}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d*$/.test(val)) {
                                handleRowAmountChange(row.id, Number(val || 0));
                              }
                            }}
                            className="w-16 p-1.5 border border-stone-300 rounded text-center font-brand-mono font-black text-sm text-[#4F2C1D] focus:ring-1 focus:ring-[#4F2C1D] focus:outline-none disabled:bg-stone-100 disabled:text-stone-400"
                          />
                        </div>
                      </td>

                      {/* Row Delete Button */}
                      <td className="p-3 text-center">
                        <button 
                          onClick={() => handleRowDelete(row.id)}
                          className="text-stone-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {parsedReviewRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-stone-400 italic">
                      All entries cleared or deleted. Close review board to enter new lines.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Area */}
        <div className="p-6 border-t-2 border-[#4F2C1D] bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="text-[10px] text-stone-400 uppercase font-black block">Ready Checklist</span>
            <span className="font-bold text-[#4F2C1D] text-xs">
              {parsedReviewRows.filter(r => r.include && r.isMatched).length} of {parsedReviewRows.filter(r => r.include).length} included items matched successfully.
            </span>
          </div>

          <div className="flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2.5 border border-stone-300 hover:border-[#4F2C1D] hover:bg-stone-50 text-[10px] font-black uppercase tracking-wider text-stone-600 hover:text-[#4F2C1D] transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyAll}
              className="px-6 py-2.5 bg-[#4F2C1D] hover:bg-opacity-95 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm transition-all active:scale-95"
            >
              <Check size={14} /> Apply Verified Entries ({parsedReviewRows.filter(r => r.include).length})
            </button>
          </div>
        </div>
      </motion.div>

      {/* Registration Modal Overlay */}
      {showRegisterForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[130] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white border-2 border-[#4F2C1D] max-w-md w-full p-6 relative shadow-2xl flex flex-col gap-4 text-left"
          >
            <button 
              onClick={() => setShowRegisterForm(false)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-600 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex flex-col items-start gap-1 pb-3 border-b border-stone-200">
              <h3 className="font-brand-serif italic text-lg text-[#4F2C1D]">Register New Product</h3>
              <p className="text-[8px] font-black uppercase tracking-wider text-stone-400">Instantly catalog items to system</p>
            </div>

            {registerError && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 font-bold text-[10px] rounded flex items-center gap-1.5 uppercase">
                <AlertTriangle size={13} className="shrink-0" />
                <span>{registerError}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-stone-500 mb-1.5 block">
                  Product Name (Auto-derived)
                </label>
                <input 
                  type="text"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                  className="w-full p-2.5 border border-stone-300 font-bold text-xs uppercase focus:border-[#4F2C1D] focus:outline-none"
                  placeholder="e.g. CHOCOLATE TRUFFLE 1 KG"
                />
              </div>

              <div>
                <label className="text-[9px] font-black uppercase tracking-wider text-stone-500 mb-1.5 block">
                  Category Group
                </label>
                <select 
                  value={registerCategory}
                  onChange={(e) => setRegisterCategory(e.target.value)}
                  className="w-full p-2.5 border border-stone-300 font-bold text-xs focus:border-[#4F2C1D] focus:outline-none"
                >
                  {CATEGORIES_LIST.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-4 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowRegisterForm(false)}
                className="flex-1 py-2 px-3 border border-stone-300 text-[10px] font-bold uppercase hover:bg-stone-50 text-stone-600 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRegister}
                disabled={isSavingProduct}
                className="flex-1 py-2 px-3 bg-[#4F2C1D] text-white text-[10px] font-black uppercase hover:bg-opacity-95 transition-all flex items-center justify-center gap-1.5"
              >
                {isSavingProduct ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Create & Pair Product
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
