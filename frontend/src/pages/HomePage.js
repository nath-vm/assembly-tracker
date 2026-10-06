import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { BASE_URL } from "../services/api";
import SearchBar  from "../components/SearchBar";
import Filters    from "../components/Filters";
import AssemblyCard   from "../components/AssemblyCard";
import AssemblyModal  from "../components/AssemblyModal";
import AssemblyForm   from "../components/AssemblyForm";
import SelectionCart  from "../components/SelectionCart";
import AdditionalMaterialsForm from "../components/AdditionalMaterialsForm";
import Pagination     from "../components/Pagination";
import ConfirmDialog  from "../components/ConfirmDialog";
import {
  getAssemblies,
  searchAssemblies,
  createAssembly,
  updateAssembly,
  deleteAssembly,
  duplicateAssembly,
  toggleAssemblyHidden,
  bulkToggleHidden,
} from "../services/assemblyService";
import { getCategories } from "../services/categoryService";

function HomePage({ isAuthenticated, onSettings, onLogin, onLogout }) {
  const [assemblies,    setAssemblies]    = useState([]);
  const [categories,    setCategories]    = useState([]);
  const [category,      setCategory]      = useState("");
  const [showHidden,    setShowHidden]    = useState(false);
  const [sortOrder,     setSortOrder]     = useState("az");
  const [page,          setPage]          = useState(1);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [showForm,      setShowForm]      = useState(false);
  const [editingEntry,  setEditingEntry]  = useState(null);
  const [selectedIds,   setSelectedIds]   = useState([]);
  const [quantities,    setQuantities]    = useState({});
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: null, payload: null, onConfirm: null });
  const [refreshing,    setRefreshing]    = useState(false);
  const [refreshMsg,    setRefreshMsg]    = useState("");
  const [loading,       setLoading]       = useState(true);
  const [loadError,     setLoadError]     = useState(false);
  // allAssemblies (for counts) is fetched separately only when needed for badge data,
  // but we derive counts from the unfiltered fetch (showHidden=true, category=all).
  const [allAssemblies, setAllAssemblies] = useState([]);
  // Track active search so it persists when category filter changes
  const [activeSearch,  setActiveSearch]  = useState({ query: "", filter: "all" });

  // Additional Materials state
  const [additionalMaterials, setAdditionalMaterials] = useState(() => {
    try {
      const stored = sessionStorage.getItem("additionalMaterials");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [showAdditionalForm, setShowAdditionalForm] = useState(false);

  // Derived — auto-updates when selections or additional materials change
  const showCart = selectedIds.length > 0 || !!additionalMaterials;

  // Persist additionalMaterials
  useEffect(() => {
    try {
      if (additionalMaterials) {
        sessionStorage.setItem("additionalMaterials", JSON.stringify(additionalMaterials));
      } else {
        sessionStorage.removeItem("additionalMaterials");
      }
    } catch { /* ignore */ }
  }, [additionalMaterials]);

  const ENTRIES_PER_PAGE = 15;

  // ─── Load Categories ──────────────────────────────────────────────────────
  useEffect(() => {
    getCategories()
      .then(data => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  // ─── Load All Assemblies (for counts) ────────────────────────────────────
  const loadAllAssemblies = useCallback(async () => {
    try {
      const data = await getAssemblies("all", true);
      if (Array.isArray(data)) setAllAssemblies(data);
      else setAllAssemblies([]);
    } catch {
      setAllAssemblies([]);
    }
  }, []);

  // ─── Load Assemblies (for grid) ───────────────────────────────────────────
  // Note: loadAllAssemblies is called inside loadAssemblies (in parallel) and
  // after mutations, so a standalone mount effect is not needed here.
  const loadAssemblies = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      // Fetch filtered view and full count list in parallel — single round-trip pair
      const [filtered, all] = await Promise.all([
        getAssemblies(category, showHidden),
        getAssemblies("all", true),
      ]);
      if (Array.isArray(filtered)) setAssemblies(filtered);
      else setAssemblies([]);
      if (Array.isArray(all)) setAllAssemblies(all);
      else setAllAssemblies([]);
    } catch {
      setAssemblies([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [category, showHidden]);

  // Single effect — fires when dependencies change; re-applies active search if one is set
  useEffect(() => {
    if (activeSearch.query) {
      // Re-run the search against the new category/showHidden filter
      searchAssemblies(activeSearch.query, activeSearch.filter, showHidden)
        .then(data => { if (Array.isArray(data)) setAssemblies(data); else setAssemblies([]); })
        .catch(() => setAssemblies([]));
      // Still refresh count data
      loadAllAssemblies();
    } else {
      loadAssemblies();
    }
    setPage(1);
  }, [loadAssemblies, loadAllAssemblies, activeSearch, showHidden]);

  // ─── Refresh / Wake Server ────────────────────────────────────────────────
  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshMsg("Waking up server...");
    try {
      await fetch(`${BASE_URL}/ping`);
      await loadAssemblies();
      await loadAllAssemblies();
      setRefreshMsg("Server is awake!");
    } catch {
      setRefreshMsg("Could not reach server. Try again.");
    } finally {
      setRefreshing(false);
      setTimeout(() => setRefreshMsg(""), 3000);
    }
  };

  // ─── Search ───────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async ({ query, filter }) => {
    setActiveSearch({ query, filter });
    if (!query) {
      loadAssemblies();
      setPage(1);
      return;
    }
    try {
      const data = await searchAssemblies(query, filter, showHidden);
      if (Array.isArray(data)) setAssemblies(data);
      else setAssemblies([]);
      setPage(1);
    } catch {
      setAssemblies([]);
      setPage(1);
    }
  }, [loadAssemblies, showHidden]);

  // ─── Save (Create or Update) ──────────────────────────────────────────────
  // FIX: apiFetch returns { error: "..." } on failure rather than throwing, so
  // the old code always closed the form and reloaded even on a server error.
  // Now we check the response, surface the error via toast, and keep the form
  // open so the user can retry without losing their work.
  const handleSave = async (formData) => {
    const res = editingEntry
      ? await updateAssembly(editingEntry._id, formData)
      : await createAssembly(formData);

    if (res?.error) {
      // Let AssemblyForm's own catch block handle the toast — just throw so
      // actuallySave's catch block fires and keeps the form open.
      throw new Error(res.error);
    }

    setShowForm(false);
    setEditingEntry(null);
    setSelectedEntry(null);
    loadAssemblies();
    loadAllAssemblies();
  };

  // ─── Edit handler ─────────────────────────────────────────────────────────
  const handleEdit = (assembly) => {
    setEditingEntry(assembly);
    setShowForm(true);
  };

  // ─── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = (assembly) => {
    setConfirmDialog({
      open: true,
      type: "delete",
      payload: { label: assembly.title || "this assembly" },
      onConfirm: async () => {
        try {
          await deleteAssembly(assembly._id);
          toast.success(`"${assembly.title}" deleted successfully.`);
        } catch {
          toast.error(`Failed to delete "${assembly.title}". Please try again.`);
        }
        setSelectedEntry(null);
        setConfirmDialog({ open: false });
        loadAssemblies();
        loadAllAssemblies();
      }
    });
  };

  // ─── Duplicate ────────────────────────────────────────────────────────────
  const handleDuplicate = async (assembly) => {
    try {
      await duplicateAssembly(assembly._id);
      toast.success(`"${assembly.title}" duplicated successfully.`);
    } catch {
      toast.error(`Failed to duplicate "${assembly.title}". Please try again.`);
    }
    setSelectedEntry(null);
    loadAssemblies();
    loadAllAssemblies();
  };

  // ─── Toggle Hidden ────────────────────────────────────────────────────────
  const handleToggleHidden = async (assembly) => {
    try {
      await toggleAssemblyHidden(assembly._id, !assembly.hidden);
      toast.success(`"${assembly.title}" ${assembly.hidden ? "unhidden" : "hidden"} successfully.`);
    } catch {
      toast.error(`Failed to update visibility for "${assembly.title}". Please try again.`);
    }
    setSelectedEntry(null);
    loadAssemblies();
    loadAllAssemblies();
  };

  // ─── Bulk Toggle Hidden ───────────────────────────────────────────────────
  // FIX: After a successful bulk hide/unhide, clear selectedIds so the cart
  // doesn't retain stale references to assemblies whose visibility just changed.
  const handleBulkToggleHidden = async (hidden) => {
    try {
      await bulkToggleHidden(selectedIds, hidden);
      toast.success(
        `${selectedIds.length} ${selectedIds.length === 1 ? "assembly" : "assemblies"} ${hidden ? "hidden" : "unhidden"} successfully.`
      );
      setSelectedIds([]);
      setQuantities({});
      loadAssemblies();
      loadAllAssemblies();
    } catch {
      toast.error("Failed to update visibility. Please try again.");
    }
  };

  // ─── Selection Cart ───────────────────────────────────────────────────────
  const handleSelectCard = (id) => {
    setSelectedIds((prev) => {
      return prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id];
    });
    setQuantities((q) => ({ ...q, [id]: q[id] || 1 }));
  };

  const handleQuantityChange = (id, value) => {
    setQuantities((q) => ({ ...q, [id]: Math.max(1, parseInt(value) || 1) }));
  };

  const handleRemoveFromCart = (id) => {
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));
    setQuantities((q) => { const nq = { ...q }; delete nq[id]; return nq; });
  };

  const handleClearCart = () => {
    setSelectedIds([]);
    setQuantities({});
    setAdditionalMaterials(null);
  };

  // Additional Materials handlers
  const handleSaveAdditionalMaterials = (data) => {
    setAdditionalMaterials(data);
    setShowAdditionalForm(false);
  };

  // ─── Catalogue counts ─────────────────────────────────────────────────────
  // Always derive from allAssemblies (fetched with showHidden=true) so Total
  // always reflects active + hidden regardless of the Show Hidden toggle.
  const hiddenCount = allAssemblies.filter(a => a.hidden).length;
  const activeCount = allAssemblies.filter(a => !a.hidden).length;
  const totalCount  = allAssemblies.length;
  const visibleAssemblies = showHidden ? allAssemblies : allAssemblies.filter(a => !a.hidden);
  const categoryCounts = visibleAssemblies.reduce((acc, a) => {
    acc[a.category] = (acc[a.category] || 0) + 1;
    return acc;
  }, {});

  // ─── Sort + Paginate ──────────────────────────────────────────────────────
  const filteredForDisplay = showHidden
    ? assemblies
    : assemblies.filter(a => !a.hidden);

  const sortedAssemblies = [...filteredForDisplay].sort((a, b) => {
    if (sortOrder === "az")     return (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
    if (sortOrder === "za")     return (b.title || "").localeCompare(a.title || "", undefined, { sensitivity: "base" });
    if (sortOrder === "newest") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    if (sortOrder === "oldest") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    return 0;
  });
  const totalPages = Math.ceil(sortedAssemblies.length / ENTRIES_PER_PAGE);
  const paginated  = sortedAssemblies.slice((page - 1) * ENTRIES_PER_PAGE, page * ENTRIES_PER_PAGE);
  const currentAssembly = selectedEntry ? assemblies.find((a) => a._id === selectedEntry._id) || selectedEntry : null;

  return (
    <div className="container">
      <div className="header-row">
        <div><h1>Assembly Track</h1><p className="subtitle">Construction Assembly Logging System</p></div>
        <div className="header-actions">
          {isAuthenticated ? (
            <>
              <button className="btn-primary" onClick={() => { setEditingEntry(null); setShowForm(true); }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 6, marginTop: -2 }}>
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                New Assembly
              </button>
              <button className="btn-secondary" onClick={onSettings}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: "middle", marginRight: 6, marginTop: -2 }}>
                  <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.01 7.01 0 0 0-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.47.47 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                </svg>
                Settings
              </button>
              <button className="btn-danger" onClick={onLogout}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 6, marginTop: -2 }}>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Logout
              </button>
            </>
          ) : (
            <>
              <button className="btn-secondary" onClick={handleRefresh} disabled={refreshing} title="Wake up the server if data isn't loading">{refreshing ? "⏳ Waking..." : "⟳"}</button>
              <button className="btn-primary" onClick={onLogin}>Admin Login</button>
            </>
          )}
        </div>
      </div>

      {refreshMsg && (
        <div style={{
          background:   refreshMsg.includes("awake") ? "var(--color-success-bg)" : refreshMsg.includes("Could not") ? "var(--color-danger-bg)" : "var(--color-primary-bg-alt)",
          border:       `1px solid ${refreshMsg.includes("awake") ? "var(--color-success-border)" : refreshMsg.includes("Could not") ? "var(--color-danger-border)" : "var(--color-primary-border)"}`,
          borderRadius: 6, padding: "8px 14px", marginBottom: 12, fontSize: 14,
          color:        refreshMsg.includes("awake") ? "var(--color-success-text)" : refreshMsg.includes("Could not") ? "var(--color-danger-text)" : "var(--color-primary-text)",
          fontWeight:   500
        }}>
          {refreshMsg}
        </div>
      )}
      <SearchBar onSearch={handleSearch} />
      <Filters
        categories={categories}
        selectedCategory={category}
        onCategoryChange={(val) => { setCategory(val); setPage(1); }}
        isAdmin={isAuthenticated}
        showHidden={showHidden}
        onToggleHidden={(val) => { setShowHidden(val); setPage(1); }}
        categoryCounts={categoryCounts}
        totalCount={totalCount}
        activeCount={activeCount}
        hiddenCount={hiddenCount}
        sortOrder={sortOrder}
        onSortChange={(val) => { setSortOrder(val); setPage(1); }}
        onOpenAdditionalMaterials={() => setShowAdditionalForm(true)}
      />
      {loading ? (
        <div className="assembly-grid" style={{ marginTop: 20 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton skeleton-image" />
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-category" />
              <div className="skeleton skeleton-btn" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="empty-state" style={{
          color: "var(--color-danger-text)", background: "var(--color-danger-bg)",
          border: "1px solid var(--color-danger-border)", borderRadius: 6,
          padding: "18px 24px", fontSize: 15
        }}>
          Could not load data — the server may be starting up.{!isAuthenticated && <> Try the <strong>⟳</strong> Refresh button above.</>}
        </div>
      ) : paginated.length === 0 ? (
        <div className="empty-state" style={{ padding: "48px 24px", textAlign: "center" }}>
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ margin: "0 auto 16px", display: "block" }}>
            <rect x="10" y="18" width="60" height="44" rx="6" fill="#e0f0fa" stroke="#2596be" strokeWidth="2"/>
            <rect x="20" y="28" width="40" height="5" rx="2.5" fill="#b3d9f0"/>
            <rect x="20" y="37" width="28" height="5" rx="2.5" fill="#b3d9f0"/>
            <rect x="20" y="46" width="20" height="5" rx="2.5" fill="#b3d9f0"/>
            <circle cx="58" cy="54" r="14" fill="#f2f2f2" stroke="#2596be" strokeWidth="2"/>
            <line x1="54" y1="54" x2="62" y2="54" stroke="#2596be" strokeWidth="2" strokeLinecap="round"/>
            <line x1="58" y1="50" x2="58" y2="58" stroke="#2596be" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <p style={{ color: "var(--color-muted-dark)", fontWeight: 600, fontSize: 15, margin: "0 0 6px" }}>No assemblies found</p>
          <p style={{ color: "var(--color-muted)", fontSize: 13, margin: 0 }}>
            {category && category !== "all"
              ? "Try a different category or clear your filters."
              : "No assemblies have been added yet."}
          </p>
        </div>
      ) : (
        <div className="assembly-grid">
          {paginated.map((assembly) => (
            <AssemblyCard
              key={assembly._id}
              assembly={assembly}
              isSelected={selectedIds.includes(assembly._id)}
              showHidden={showHidden}
              onSelect={() => handleSelectCard(assembly._id)}
              onView={() => setSelectedEntry(assembly)}
              onEdit={isAuthenticated ? () => handleEdit(assembly) : undefined}
              onDelete={isAuthenticated ? () => handleDelete(assembly) : undefined}
              onDuplicate={isAuthenticated ? () => handleDuplicate(assembly) : undefined}
              onToggleHidden={isAuthenticated ? () => handleToggleHidden(assembly) : undefined}
            />
          ))}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      {selectedEntry && currentAssembly && (
        <AssemblyModal
          assembly={currentAssembly}
          isAuthenticated={isAuthenticated}
          quantity={quantities[currentAssembly._id] || 1}
          onQuantityChange={(val) => handleQuantityChange(currentAssembly._id, val)}
          onClose={() => setSelectedEntry(null)}
          onEdit={() => { handleEdit(currentAssembly); setSelectedEntry(null); }}
          onDelete={() => handleDelete(currentAssembly)}
          onDuplicate={() => handleDuplicate(currentAssembly)}
          onToggleHidden={() => handleToggleHidden(currentAssembly)}
          onReload={loadAssemblies}
        />
      )}
      {showForm && <AssemblyForm entry={editingEntry} onClose={() => { setShowForm(false); setEditingEntry(null); }} onSave={handleSave} />}
      {showCart && (
        <SelectionCart
          selectedIds={selectedIds}
          assemblies={assemblies}
          quantities={quantities}
          onQuantityChange={handleQuantityChange}
          onRemove={handleRemoveFromCart}
          onClear={handleClearCart}
          isAdmin={isAuthenticated}
          onBulkToggleHidden={handleBulkToggleHidden}
          onAssemblyClick={(assembly) => setSelectedEntry(assembly)}
          additionalMaterials={additionalMaterials}
          onOpenAdditionalMaterials={() => setShowAdditionalForm(true)}
          onClearAdditionalMaterials={() => setAdditionalMaterials(null)}
          onReload={() => { loadAssemblies(); loadAllAssemblies(); }}
        />
      )}
      {showAdditionalForm && (
        <AdditionalMaterialsForm
          initialData={additionalMaterials}
          onSave={handleSaveAdditionalMaterials}
          onClose={() => setShowAdditionalForm(false)}
        />
      )}
      <ConfirmDialog open={confirmDialog.open} type={confirmDialog.type} payload={confirmDialog.payload} onConfirm={confirmDialog.onConfirm} onCancel={() => setConfirmDialog({ open: false })} />
    </div>
  );
}

export default HomePage;