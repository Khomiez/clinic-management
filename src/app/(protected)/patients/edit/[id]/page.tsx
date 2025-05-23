// src/app/(protected)/patients/edit/[id]/page.tsx - Fixed with async params
"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Navbar,
  Sidebar,
  LoadingScreen,
  ErrorScreen,
  MedicalHistorySection,
  ThaiDatePicker,
} from "@/components";
import { IPatient, IClinic, IHistoryRecord } from "@/interfaces";
import { useAppSelector } from "@/redux/hooks/useAppSelector";
import { useAppDispatch } from "@/redux/hooks/useAppDispatch";
import {
  fetchPatientById,
  updatePatient,
} from "@/redux/features/patients/patientsSlice";
import { fetchClinics } from "@/redux/features/clinics/clinicsSlice";
import { fetchAdminData } from "@/redux/features/admin/adminSlice";
import { useAuth } from "@/context";
import { toIdString } from "@/utils/mongoHelpers";
import { useDocumentManager, DocumentOperation } from "@/hooks";

// Fix type for Next.js 15 - params is now a Promise
interface PageProps {
  params: Promise<{ id: string }>;
}

// Helper function to format date for input fields
const formatDateForInput = (date: string | Date | undefined): string => {
  if (!date) return "";

  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toISOString().split("T")[0];
  } catch (e) {
    return "";
  }
};

export default function EditPatient({ params }: PageProps) {
  // State to store the actual patient ID once params are resolved
  const [patientId, setPatientId] = useState<string | null>(null);

  // Router and search params
  const router = useRouter();
  const searchParams = useSearchParams();
  const clinicId = searchParams.get("clinicId");

  // Redux hooks
  const dispatch = useAppDispatch();
  const adminInfo = useAppSelector((state) => state.admin);
  const clinicsState = useAppSelector((state) => state.clinics);
  const patientLoading = useAppSelector((state) => state.patients.loading);
  const patientFromStore = useAppSelector(
    (state) => state.patients.currentPatient
  );

  // Auth context
  const { isAuthenticated, logout, loading } = useAuth();

  // State for patient data and edit tracking
  const [patient, setPatient] = useState<Partial<IPatient>>({
    name: "",
    HN_code: "",
    ID_code: "",
    lastVisit: undefined,
    history: [],
  });
  const [originalPatient, setOriginalPatient] =
    useState<Partial<IPatient> | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRollbackInProgress, setIsRollbackInProgress] = useState(false);

  // State for clinics
  const [selectedClinic, setSelectedClinic] = useState<IClinic | undefined>(
    undefined
  );

  // State for showing discard confirmation
  const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false);

  // Resolve params Promise for Next.js 15
  useEffect(() => {
    const resolveParams = async () => {
      const resolvedParams = await params;
      setPatientId(resolvedParams.id);
    };

    resolveParams();
  }, [params]);

  // Initialize document manager for handling file operations
  const documentManager = useDocumentManager({
    onAddDocument: (recordIndex, url) => {
      setPatient((prev) => {
        if (!prev.history) return prev;

        // Adjust for removed records when adding documents
        const actualIndex = getActualRecordIndex(recordIndex);
        if (actualIndex < 0 || actualIndex >= prev.history.length) {
          console.error(`Invalid record index: ${actualIndex}`);
          return prev;
        }

        const updatedHistory = [...prev.history];
        const record = updatedHistory[actualIndex];

        if (!record) {
          console.error(`Record at index ${actualIndex} is undefined`);
          return prev;
        }

        updatedHistory[actualIndex] = {
          ...record,
          document_urls: [...(record.document_urls || []), url],
        };

        return {
          ...prev,
          history: updatedHistory,
        };
      });
    },
    onRemoveDocument: (recordIndex, documentIndex) => {
      setPatient((prev) => {
        if (!prev.history) return prev;

        // Adjust for removed records when removing documents
        const actualIndex = getActualRecordIndex(recordIndex);
        if (actualIndex < 0 || actualIndex >= prev.history.length) {
          console.error(`Invalid record index: ${actualIndex}`);
          return prev;
        }

        const updatedHistory = [...prev.history];
        const record = updatedHistory[actualIndex];

        if (!record) {
          console.error(`Record at index ${actualIndex} is undefined`);
          return prev;
        }

        if (
          !record.document_urls ||
          documentIndex < 0 ||
          documentIndex >= record.document_urls.length
        ) {
          console.error(
            `Invalid document index: ${documentIndex} for record ${actualIndex}`
          );
          return prev;
        }

        updatedHistory[actualIndex] = {
          ...record,
          document_urls: record.document_urls.filter(
            (_, i) => i !== documentIndex
          ),
        };

        return {
          ...prev,
          history: updatedHistory,
        };
      });
    },
    clinicId: clinicId || "",
  });

  // Helper function to get actual record index (accounting for removed records)
  const getActualRecordIndex = (displayIndex: number) => {
    // Since we're not actually removing records from state anymore,
    // we can use the display index directly
    return displayIndex;
  };

  // Fetch admin data and clinics when component mounts
  useEffect(() => {
    dispatch(fetchAdminData());
  }, [dispatch]);

  // Fetch clinics when admin data is available
  useEffect(() => {
    if (adminInfo.id && adminInfo.loading === "succeeded") {
      dispatch(fetchClinics(adminInfo.id));
    }
  }, [adminInfo.loading, adminInfo.id, dispatch]);

  // Set selected clinic based on URL param
  useEffect(() => {
    if (
      clinicsState.loading === "succeeded" &&
      Array.isArray(clinicsState.items) &&
      clinicsState.items.length > 0
    ) {
      if (clinicId) {
        const clinic = clinicsState.items.find(
          (c) => toIdString(c._id) === clinicId
        );
        if (clinic) {
          setSelectedClinic(clinic);
        }
      }
    }
  }, [clinicsState.loading, clinicsState.items, clinicId]);

  // Fetch patient data when ID is available
  useEffect(() => {
    if (patientId && clinicId) {
      dispatch(fetchPatientById({ patientId, clinicId }));
    }
  }, [patientId, clinicId, dispatch]);

  // Update local state when patient data is loaded
  useEffect(() => {
    if (patientFromStore && patientLoading === "succeeded") {
      // Process dates in history records
      const processedHistory = patientFromStore.history
        ? patientFromStore.history.map((record) => ({
            ...record,
            timestamp:
              typeof record.timestamp === "string"
                ? new Date(record.timestamp)
                : record.timestamp,
          }))
        : [];

      // Sort history by date (newest first)
      const sortedHistory = [...processedHistory].sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateB - dateA; // Sort descending (newest first)
      });

      const patientData = {
        ...patientFromStore,
        history: sortedHistory,
      };

      setPatient(patientData);
      setOriginalPatient(JSON.parse(JSON.stringify(patientData))); // Deep copy
      setHasUnsavedChanges(false);
    }
  }, [patientFromStore, patientLoading]);

  // Check for unsaved changes
  useEffect(() => {
    if (originalPatient && patient) {
      const hasChanges =
        JSON.stringify(patient) !== JSON.stringify(originalPatient);
      setHasUnsavedChanges(
        hasChanges || documentManager.pendingOperations.length > 0
      );
    }
  }, [patient, originalPatient, documentManager.pendingOperations]);

  // Handle browser refresh/close with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue =
          "You have unsaved changes. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Handle input changes for patient info
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Special handling for date fields
    if (name === "lastVisit" && value) {
      setPatient((prev) => ({
        ...prev,
        [name]: new Date(value),
      }));
    } else {
      setPatient((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // Enhanced save handler with proper commit
  const handleSave = async () => {
    if (!patient._id || !clinicId) {
      alert("Missing patient ID or clinic ID");
      return;
    }

    // Validate required fields
    if (!patient.name || !patient.HN_code) {
      alert("Name and Hospital Number (HN) are required fields");
      return;
    }

    setIsSaving(true);

    try {
      // Filter out records that are marked for deletion
      const recordsMarkedForDeletion =
        documentManager.getPendingRecordOperations();
      const filteredHistory = patient.history?.filter(
        (_, index) => !documentManager.isRecordMarkedForDeletion(index)
      );

      // Prepare patient data for saving
      const patientToSave = {
        ...patient,
        history: filteredHistory,
      };

      // First save patient data
      await dispatch(
        updatePatient({
          patientId: toIdString(patient._id),
          clinicId,
          patientData: patientToSave,
        })
      ).unwrap();

      // Then commit all pending file operations (delete files marked for removal)
      await documentManager.commitPendingOperations();

      // Update original state to current state
      setOriginalPatient(JSON.parse(JSON.stringify(patientToSave)));
      setHasUnsavedChanges(false);

      // Navigate back to dashboard after successful update
      router.push(`/dashboard`);
    } catch (error: any) {
      console.error("Failed to update patient:", error);

      // Show error and ask if user wants to keep editing
      const keepEditing = confirm(
        `Failed to save changes: ${
          error.message || "Unknown error"
        }. Would you like to keep editing?`
      );

      if (!keepEditing) {
        // Reset to original state and go back
        await handleDiscard();
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Handle discard changes
  const handleDiscard = async () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirmation(true);
    } else {
      router.push(`/dashboard`);
    }
  };

  // Confirm discard changes with proper rollback
  const confirmDiscard = async () => {
    setIsRollbackInProgress(true);

    try {
      // Rollback any pending file operations
      await documentManager.rollbackPendingOperations();

      // Reset to original state
      if (originalPatient) {
        setPatient(JSON.parse(JSON.stringify(originalPatient)));
        setHasUnsavedChanges(false);
      }

      setShowDiscardConfirmation(false);
      router.push(`/dashboard`);
    } catch (error) {
      console.error("Error during discard:", error);
      alert("There was an error discarding changes. Please try again.");
    } finally {
      setIsRollbackInProgress(false);
    }
  };

  // Cancel discard
  const cancelDiscard = () => {
    setShowDiscardConfirmation(false);
  };

  // Clinic selection change handler
  const handleClinicChange = (clinicId: string): void => {
    if (!clinicId) return;

    const clinic = clinicsState.items.find(
      (c) => toIdString(c._id) === clinicId
    );
    if (clinic) {
      setSelectedClinic(clinic);
    }
  };

  // Medical History handlers
  const handleAddRecord = (newRecord: IHistoryRecord) => {
    setPatient((prev) => {
      // Add the new record
      const updatedHistory = [...(prev.history || []), newRecord];

      // Sort by date (newest first)
      const sortedHistory = updatedHistory.sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateB - dateA;
      });

      return {
        ...prev,
        history: sortedHistory,
      };
    });
  };

  const handleUpdateRecord = (index: number, updatedRecord: IHistoryRecord) => {
    setPatient((prev) => {
      if (!prev.history) return prev;

      const updatedHistory = [...prev.history];
      updatedHistory[index] = updatedRecord;

      return {
        ...prev,
        history: updatedHistory,
      };
    });
  };

  // Updated: Use deferred deletion for records
  const handleRemoveRecord = async (index: number) => {
    // Get the record before removing it
    const recordToRemove = patient.history?.[index];
    if (recordToRemove) {
      const documentUrls = recordToRemove.document_urls || [];

      // Mark the record for deferred deletion (don't actually delete yet)
      await documentManager.markRecordForDeletion(index, documentUrls);

      // Don't remove from state - just mark it for visual indication
      // The actual removal will happen only when saving
    }
  };

  const handleUpdateRecordDate = (index: number, newDate: Date) => {
    setPatient((prev) => {
      if (!prev.history) return prev;

      const updatedHistory = [...prev.history];
      updatedHistory[index] = {
        ...updatedHistory[index],
        timestamp: newDate,
      };

      // Re-sort by date (newest first)
      const sortedHistory = updatedHistory.sort((a, b) => {
        const dateA = new Date(a.timestamp).getTime();
        const dateB = new Date(b.timestamp).getTime();
        return dateB - dateA;
      });

      return {
        ...prev,
        history: sortedHistory,
      };
    });
  };

  // Document handlers - using document manager with deferred operations
  const handleAddDocument = async (recordIndex: number, url: string) => {
    // Use document manager to track this addition
    await documentManager.addDocumentWithRollback(recordIndex, url, false);
  };

  const handleRemoveDocument = async (
    recordIndex: number,
    documentIndex: number
  ) => {
    // Get the URL before removing for tracking
    const record = patient.history?.[recordIndex];
    const url = record?.document_urls?.[documentIndex];

    if (url) {
      // Use document manager with deferred deletion
      await documentManager.removeDocumentWithDeferred(
        recordIndex,
        documentIndex,
        url
      );
    }
  };

  // Show loading screen while resolving params or loading data
  if (
    loading ||
    adminInfo.loading === "pending" ||
    patientLoading === "pending" ||
    !patientId // Show loading until params are resolved
  ) {
    return <LoadingScreen pageName="Edit Patient" />;
  }

  // Show error screens
  if (adminInfo.loading === "failed") {
    return (
      <ErrorScreen
        title="Admin Data Error"
        error={adminInfo.error || "Failed to load administrator data"}
        retry={() => dispatch(fetchAdminData())}
        goBack={() => router.push("/dashboard")}
      />
    );
  }

  if (clinicsState.loading === "failed") {
    return (
      <ErrorScreen
        title="Clinics Data Error"
        error={clinicsState.error || "Failed to load clinics data"}
        retry={() => dispatch(fetchClinics(adminInfo.id!))}
        goBack={() => router.push("/dashboard")}
      />
    );
  }

  if (patientLoading === "failed") {
    return (
      <ErrorScreen
        title="Patient Data Error"
        error={"Failed to load patient data"}
        retry={() =>
          dispatch(
            fetchPatientById({
              patientId: patientId!,
              clinicId: clinicId || "",
            })
          )
        }
        goBack={() => router.push("/dashboard")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Discard Confirmation Modal */}
      {showDiscardConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-xl font-bold text-red-600 mb-4">
              Discard Changes?
            </h3>
            <p className="text-gray-700 mb-4">
              You have unsaved changes that will be lost.
            </p>
            {documentManager.pendingOperations.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                <p className="text-orange-700 text-sm">
                  <strong>{documentManager.pendingOperations.length}</strong>{" "}
                  file operation(s) will be reversed:
                </p>
                <ul className="text-orange-600 text-xs mt-1 ml-4 list-disc">
                  {documentManager.pendingOperations.map((op, idx) => (
                    <li key={idx}>
                      {op.type === "add"
                        ? "Delete newly added file"
                        : op.type === "remove"
                        ? "Restore removed file"
                        : op.type === "remove_record"
                        ? "Restore deleted record"
                        : "Unknown operation"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-gray-700 mb-6">
              Are you sure you want to continue?
            </p>
            <div className="flex space-x-3">
              <button
                onClick={cancelDiscard}
                className="flex-1 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition"
                disabled={isRollbackInProgress}
              >
                Keep Editing
              </button>
              <button
                onClick={confirmDiscard}
                className="flex-1 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                disabled={isRollbackInProgress}
              >
                {isRollbackInProgress
                  ? "Reverting changes..."
                  : "Discard Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Navbar
        clinicName={selectedClinic?.name}
        adminUsername={adminInfo?.username || "Administrator"}
        logout={logout}
      />

      <div className="flex">
        <Sidebar
          clinics={Array.isArray(clinicsState.items) ? clinicsState.items : []}
          selectedClinic={selectedClinic}
          handleClinicChange={handleClinicChange}
        />

        <div className="flex-grow p-8">
          {/* Header with Main Save/Cancel Buttons */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-blue-800 flex items-center gap-2">
                แก้ไขข้อมูลผู้ป่วย <span className="text-xl">👩‍⚕️</span>
                {hasUnsavedChanges && (
                  <span className="text-sm bg-orange-100 text-orange-600 px-2 py-1 rounded">
                    {documentManager.pendingOperations.length > 0
                      ? `${documentManager.pendingOperations.length} pending operations`
                      : "Unsaved changes"}
                  </span>
                )}
              </h1>
              <p className="text-slate-500">
                ปรับปรุงข้อมูลผู้ป่วยและประวัติการรักษา
              </p>
              {documentManager.pendingOperations.length > 0 && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                  <strong>Pending Operations:</strong>
                  <ul className="mt-1 ml-4 list-disc">
                    {documentManager.pendingOperations.map((op, idx) => (
                      <li key={idx}>
                        {op.type === "add"
                          ? "📎 Added"
                          : op.type === "remove"
                          ? "🗑️ Marked for deletion"
                          : op.type === "remove_record"
                          ? "📋 Record marked for deletion"
                          : "Unknown"}
                        :
                        <span className="ml-1 font-mono">
                          {op.type === "remove_record"
                            ? `Record with ${
                                op.recordDocuments?.length || 0
                              } documents`
                            : op.url.split("/").pop()}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 font-medium">
                    These changes will be committed when you save.
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleDiscard}
                className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition flex items-center gap-1"
                disabled={isSaving || isRollbackInProgress}
              >
                <span>Cancel</span> ❌
              </button>
              <button
                onClick={handleSave}
                disabled={
                  isSaving || !hasUnsavedChanges || isRollbackInProgress
                }
                className="flex items-center bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors disabled:bg-blue-300"
              >
                {isSaving ? (
                  <>
                    <span className="animate-spin mr-2">⏳</span>
                    Saving...
                  </>
                ) : (
                  <>Save Changes 💾</>
                )}
              </button>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Patient Information Card */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl p-6 shadow-sm border border-blue-100">
                <h2 className="text-xl text-blue-700 font-medium mb-4 flex items-center gap-2">
                  ข้อมูลผู้ป่วย 📋
                </h2>

                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-6">
                    <div>
                      <label
                        className="block text-sm font-medium text-slate-600 mb-1"
                        htmlFor="name"
                      >
                        ชื่อ-สกุล <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={patient.name || ""}
                        onChange={handleChange}
                        placeholder="Enter patient's full name"
                        required
                        className="w-full px-4 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50"
                      />
                    </div>

                    <div>
                      <label
                        className="block text-sm font-medium text-slate-600 mb-1"
                        htmlFor="HN_code"
                      >
                        Hospital Number (HN){" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="HN_code"
                        name="HN_code"
                        value={patient.HN_code || ""}
                        onChange={handleChange}
                        disabled={true}
                        className="w-full px-4 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-100 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      className="block text-sm font-medium text-slate-600 mb-1"
                      htmlFor="ID_code"
                    >
                      รหัสประชาชน
                    </label>
                    <input
                      type="text"
                      id="ID_code"
                      name="ID_code"
                      value={patient.ID_code || ""}
                      onChange={handleChange}
                      placeholder="Enter ID number (optional)"
                      className="w-full px-4 py-2 rounded-lg border border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-blue-50"
                    />
                  </div>

                  <div>
                    <label
                      className="block text-sm font-medium text-slate-600 mb-1"
                      htmlFor="lastVisit"
                    >
                      วันที่เข้ารับบริการครั้งล่าสุด
                    </label>
                    <ThaiDatePicker
                      selectedDate={
                        patient.lastVisit ? new Date(patient.lastVisit) : null
                      }
                      onChange={(date) => {
                        setPatient((prev) => ({
                          ...prev,
                          lastVisit: date,
                        }));
                      }}
                      placeholder="เลือกวันที่เข้ารับบริการ"
                    />
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <p className="text-sm text-blue-600">
                      <span className="font-bold">Note:</span> ใช้ปุ่ม "save
                      changes"
                      ด้านบนเพื่อบันทึกข้อมูลผู้ป่วยและประวัติการรักษาทั้งหมด
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Medical History Section */}
            <div className="lg:col-span-2">
              <MedicalHistorySection
                patientId={patientId!}
                clinicId={
                  selectedClinic ? toIdString(selectedClinic._id) : undefined
                }
                historyRecords={patient.history || []}
                onAddRecord={handleAddRecord}
                onUpdateRecord={handleUpdateRecord}
                onRemoveRecord={handleRemoveRecord}
                onUpdateRecordDate={handleUpdateRecordDate}
                onAddDocument={handleAddDocument}
                onRemoveDocument={handleRemoveDocument}
                // Pass documentManager props with undo functionality
                pendingOperations={documentManager.pendingOperations}
                isProcessing={documentManager.isProcessing}
                addDocumentWithRollback={
                  documentManager.addDocumentWithRollback
                }
                removeDocumentWithDeferred={
                  documentManager.removeDocumentWithDeferred
                }
                markRecordForDeletion={documentManager.markRecordForDeletion}
                rollbackPendingOperations={
                  documentManager.rollbackPendingOperations
                }
                commitPendingOperations={
                  documentManager.commitPendingOperations
                }
                cleanupOrphanedFiles={documentManager.cleanupOrphanedFiles}
                isRecordMarkedForDeletion={
                  documentManager.isRecordMarkedForDeletion
                }
                getPendingRecordOperations={
                  documentManager.getPendingRecordOperations
                }
                removePendingRecordDeletion={
                  documentManager.removePendingRecordDeletion
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
