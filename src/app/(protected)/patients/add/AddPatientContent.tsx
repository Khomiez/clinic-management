"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Navbar,
  Sidebar,
  LoadingScreen,
  ErrorScreen,
  PatientForm,
} from "@/components";
import { IClinic } from "@/interfaces";
import { useAppSelector } from "@/redux/hooks/useAppSelector";
import { useAppDispatch } from "@/redux/hooks/useAppDispatch";
import { addPatient } from "@/redux/features/patients/patientsSlice";
import { fetchClinics } from "@/redux/features/clinics/clinicsSlice";
import { fetchAdminData } from "@/redux/features/admin/adminSlice";
import { useAuth } from "@/context";
import { toIdString } from "@/utils/mongoHelpers";
import { useNextHNCode } from "@/hooks/useNextHNCode";

export default function AddPatientContent() {
  // Router and search params
  const router = useRouter();
  const searchParams = useSearchParams();
  const clinicId = searchParams.get("clinicId");

  // Redux hooks
  const dispatch = useAppDispatch();
  const adminInfo = useAppSelector((state) => state.admin);
  const clinicsState = useAppSelector((state) => state.clinics);
  const patientStatus = useAppSelector((state) => state.patients.loading);

  // Auth context
  const { isAuthenticated, logout, loading } = useAuth();

  // Local state for patient data
  const [patient, setPatient] = useState({
    name: "",
    ID_code: "",
    lastVisit: "",
    history: [],
  });

  // State for clinics
  const [selectedClinic, setSelectedClinic] = useState<IClinic | undefined>(
    undefined
  );

  // Get next HN code
  const {
    nextHNCode,
    loading: hnLoading,
    error: hnError,
  } = useNextHNCode(clinicId || undefined);

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
      } else if (!selectedClinic) {
        // If no clinicId in URL and no clinic selected, set the first one
        setSelectedClinic(clinicsState.items[0]);
        // Update URL with first clinic ID
        router.push(
          `/patients/add?clinicId=${toIdString(clinicsState.items[0]._id)}`
        );
      }
    }
  }, [
    clinicsState.loading,
    clinicsState.items,
    clinicId,
    selectedClinic,
    router,
  ]);

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPatient((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clinicId) {
      alert("Missing clinic ID");
      return;
    }

    // Validate required fields
    if (!patient.name) {
      alert("Name is required");
      return;
    }

    try {
      // Create patient without HN_code - it will be auto-generated on the server
      const patientToSubmit = {
        ...patient,
        HN_code: nextHNCode, // This will be used as a fallback if the server-side logic fails
        // Convert lastVisit to Date if it's a string
        lastVisit: patient.lastVisit ? new Date(patient.lastVisit) : undefined,
      };

      await dispatch(
        addPatient({
          clinicId,
          patientData: patientToSubmit,
        })
      ).unwrap();

      // Navigate back to dashboard after successful creation
      router.push(`/dashboard`);
    } catch (error) {
      console.error("Failed to add patient:", error);
      alert("Failed to add patient. Please try again.");
    }
  };

  const handleCancel = () => {
    router.push(`/dashboard`);
  };

  const handleClinicChange = (clinicId: string): void => {
    if (!clinicId) return;

    const clinic = clinicsState.items.find(
      (c) => toIdString(c._id) === clinicId
    );
    if (clinic) {
      setSelectedClinic(clinic);
      // Update the URL
      router.push(`/patients/add?clinicId=${clinicId}`);
    }
  };

  // Show loading screen
  if (loading || adminInfo.loading === "pending") {
    return <LoadingScreen pageName="Add Patient" />;
  }

  // Show error if admin data or clinics failed to load
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
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
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-blue-800 flex items-center gap-2">
                เพิ่มผู้ป่วยใหม่ <span className="text-xl">👤</span>
              </h1>
              <p className="text-slate-500">สร้างประวัติผู้ป่วยใหม่ในระบบ</p>
            </div>
          </div>

          {/* Main Content */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-blue-100">
            <h2 className="text-xl text-blue-700 font-medium mb-6 flex items-center gap-2">
              ข้อมูลผู้ป่วย 📋
            </h2>

            {selectedClinic ? (
              <PatientForm
                patient={patient}
                handleChange={handleChange}
                handleSubmit={handleSubmit}
                isSubmitting={patientStatus === "pending"}
                submitLabel="Add Patient"
                cancelAction={handleCancel}
                isEditMode={false}
                nextHNCode={nextHNCode}
              />
            ) : (
              <div className="text-center py-8 text-blue-500">
                <div className="text-5xl mb-4">🏥</div>
                <h3 className="text-xl font-medium mb-2">
                  กรุณาเลือกคลินิกก่อน
                </h3>
                <p className="text-slate-500 mb-4">
                  กรุณาเลือกคลินิกจากแถบด้านข้างก่อนเพิ่มผู้ป่วย
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
