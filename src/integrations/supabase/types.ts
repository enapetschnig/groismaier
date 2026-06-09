export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_config_options: {
        Row: {
          created_at: string | null
          farbe: string | null
          id: string
          is_active: boolean | null
          kategorie: string
          label: string
          sort_order: number | null
          updated_at: string | null
          wert: string
        }
        Insert: {
          created_at?: string | null
          farbe?: string | null
          id?: string
          is_active?: boolean | null
          kategorie: string
          label: string
          sort_order?: number | null
          updated_at?: string | null
          wert: string
        }
        Update: {
          created_at?: string | null
          farbe?: string | null
          id?: string
          is_active?: boolean | null
          kategorie?: string
          label?: string
          sort_order?: number | null
          updated_at?: string | null
          wert?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      assignment_resources: {
        Row: {
          created_at: string | null
          created_by: string
          datum: string
          einheit: string | null
          id: string
          menge: number | null
          project_id: string
          resource_name: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          datum: string
          einheit?: string | null
          id?: string
          menge?: number | null
          project_id: string
          resource_name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          datum?: string
          einheit?: string | null
          id?: string
          menge?: number | null
          project_id?: string
          resource_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_resources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      austrian_holidays: {
        Row: {
          bezeichnung: string
          datum: string
        }
        Insert: {
          bezeichnung: string
          datum: string
        }
        Update: {
          bezeichnung?: string
          datum?: string
        }
        Relationships: []
      }
      board_projects: {
        Row: {
          beschreibung: string | null
          board_color: string | null
          color_mode: string | null
          created_at: string | null
          created_by: string | null
          end_date: string
          id: string
          project_id: string
          sort_order: number | null
          start_date: string
        }
        Insert: {
          beschreibung?: string | null
          board_color?: string | null
          color_mode?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date: string
          id?: string
          project_id: string
          sort_order?: number | null
          start_date: string
        }
        Update: {
          beschreibung?: string | null
          board_color?: string | null
          color_mode?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          id?: string
          project_id?: string
          sort_order?: number | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      company_holidays: {
        Row: {
          bezeichnung: string | null
          created_at: string | null
          created_by: string
          datum: string
          id: string
        }
        Insert: {
          bezeichnung?: string | null
          created_at?: string | null
          created_by: string
          datum: string
          id?: string
        }
        Update: {
          bezeichnung?: string | null
          created_at?: string | null
          created_by?: string
          datum?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_holidays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_history: {
        Row: {
          beschreibung: string | null
          betreff: string | null
          created_at: string | null
          customer_id: string | null
          datum: string
          dauer_minuten: number | null
          erstellt_von: string | null
          id: string
          kontaktperson: string | null
          project_id: string | null
          typ: string
          updated_at: string | null
        }
        Insert: {
          beschreibung?: string | null
          betreff?: string | null
          created_at?: string | null
          customer_id?: string | null
          datum?: string
          dauer_minuten?: number | null
          erstellt_von?: string | null
          id?: string
          kontaktperson?: string | null
          project_id?: string | null
          typ?: string
          updated_at?: string | null
        }
        Update: {
          beschreibung?: string | null
          betreff?: string | null
          created_at?: string | null
          customer_id?: string | null
          datum?: string
          dauer_minuten?: number | null
          erstellt_von?: string | null
          id?: string
          kontaktperson?: string | null
          project_id?: string | null
          typ?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          anrede: string | null
          created_at: string | null
          customer_id: string
          email: string | null
          id: string
          ist_hauptkontakt: boolean | null
          nachname: string | null
          notizen: string | null
          position: string | null
          telefon: string | null
          telefon2: string | null
          titel: string | null
          updated_at: string | null
          vorname: string | null
        }
        Insert: {
          anrede?: string | null
          created_at?: string | null
          customer_id: string
          email?: string | null
          id?: string
          ist_hauptkontakt?: boolean | null
          nachname?: string | null
          notizen?: string | null
          position?: string | null
          telefon?: string | null
          telefon2?: string | null
          titel?: string | null
          updated_at?: string | null
          vorname?: string | null
        }
        Update: {
          anrede?: string | null
          created_at?: string | null
          customer_id?: string
          email?: string | null
          id?: string
          ist_hauptkontakt?: boolean | null
          nachname?: string | null
          notizen?: string | null
          position?: string | null
          telefon?: string | null
          telefon2?: string | null
          titel?: string | null
          updated_at?: string | null
          vorname?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          adresse: string | null
          anrede: string | null
          ansprechpartner: string | null
          branche: string | null
          created_at: string | null
          email: string | null
          farbe_bg: string | null
          farbe_text: string | null
          firmenname: string | null
          herkunft: string | null
          id: string
          kundennummer: string | null
          kundentyp: string | null
          land: string | null
          nachname: string | null
          name: string
          nettofrist: number | null
          notizen: string | null
          ort: string | null
          plz: string | null
          rechnungs_adresse: string | null
          rechnungs_land: string | null
          rechnungs_ort: string | null
          rechnungs_plz: string | null
          skonto_prozent: number | null
          skonto_tage: number | null
          telefon: string | null
          telefon2: string | null
          titel: string | null
          uid_nummer: string | null
          updated_at: string | null
          user_id: string
          vorname: string | null
          website: string | null
          wichtige_daten: Json
          zahlungsbedingungen: string | null
        }
        Insert: {
          adresse?: string | null
          anrede?: string | null
          ansprechpartner?: string | null
          branche?: string | null
          created_at?: string | null
          email?: string | null
          farbe_bg?: string | null
          farbe_text?: string | null
          firmenname?: string | null
          herkunft?: string | null
          id?: string
          kundennummer?: string | null
          kundentyp?: string | null
          land?: string | null
          nachname?: string | null
          name: string
          nettofrist?: number | null
          notizen?: string | null
          ort?: string | null
          plz?: string | null
          rechnungs_adresse?: string | null
          rechnungs_land?: string | null
          rechnungs_ort?: string | null
          rechnungs_plz?: string | null
          skonto_prozent?: number | null
          skonto_tage?: number | null
          telefon?: string | null
          telefon2?: string | null
          titel?: string | null
          uid_nummer?: string | null
          updated_at?: string | null
          user_id: string
          vorname?: string | null
          website?: string | null
          wichtige_daten?: Json
          zahlungsbedingungen?: string | null
        }
        Update: {
          adresse?: string | null
          anrede?: string | null
          ansprechpartner?: string | null
          branche?: string | null
          created_at?: string | null
          email?: string | null
          farbe_bg?: string | null
          farbe_text?: string | null
          firmenname?: string | null
          herkunft?: string | null
          id?: string
          kundennummer?: string | null
          kundentyp?: string | null
          land?: string | null
          nachname?: string | null
          name?: string
          nettofrist?: number | null
          notizen?: string | null
          ort?: string | null
          plz?: string | null
          rechnungs_adresse?: string | null
          rechnungs_land?: string | null
          rechnungs_ort?: string | null
          rechnungs_plz?: string | null
          skonto_prozent?: number | null
          skonto_tage?: number | null
          telefon?: string | null
          telefon2?: string | null
          titel?: string | null
          uid_nummer?: string | null
          updated_at?: string | null
          user_id?: string
          vorname?: string | null
          website?: string | null
          wichtige_daten?: Json
          zahlungsbedingungen?: string | null
        }
        Relationships: []
      }
      disturbance_materials: {
        Row: {
          created_at: string
          disturbance_id: string
          einheit: string | null
          einzelpreis: number | null
          id: string
          material: string
          menge: string | null
          notizen: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          disturbance_id: string
          einheit?: string | null
          einzelpreis?: number | null
          id?: string
          material: string
          menge?: string | null
          notizen?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          disturbance_id?: string
          einheit?: string | null
          einzelpreis?: number | null
          id?: string
          material?: string
          menge?: string | null
          notizen?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disturbance_materials_disturbance_id_fkey"
            columns: ["disturbance_id"]
            isOneToOne: false
            referencedRelation: "disturbances"
            referencedColumns: ["id"]
          },
        ]
      }
      disturbance_photos: {
        Row: {
          created_at: string
          disturbance_id: string
          file_name: string
          file_path: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          disturbance_id: string
          file_name: string
          file_path: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          disturbance_id?: string
          file_name?: string
          file_path?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disturbance_photos_disturbance_id_fkey"
            columns: ["disturbance_id"]
            isOneToOne: false
            referencedRelation: "disturbances"
            referencedColumns: ["id"]
          },
        ]
      }
      disturbance_workers: {
        Row: {
          created_at: string
          disturbance_id: string
          id: string
          is_main: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          disturbance_id: string
          id?: string
          is_main?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          disturbance_id?: string
          id?: string
          is_main?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disturbance_workers_disturbance_id_fkey"
            columns: ["disturbance_id"]
            isOneToOne: false
            referencedRelation: "disturbances"
            referencedColumns: ["id"]
          },
        ]
      }
      disturbances: {
        Row: {
          beschreibung: string
          created_at: string
          customer_id: string | null
          datum: string
          end_time: string
          id: string
          is_verrechnet: boolean
          kunde_adresse: string | null
          kunde_email: string | null
          kunde_name: string
          kunde_ort: string | null
          kunde_plz: string | null
          kunde_telefon: string | null
          notizen: string | null
          pause_minutes: number
          pdf_gesendet_am: string | null
          pdf_path: string | null
          project_id: string | null
          start_time: string
          status: string
          stunden: number
          unterschrift_am: string | null
          unterschrift_kunde: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          beschreibung: string
          created_at?: string
          customer_id?: string | null
          datum: string
          end_time: string
          id?: string
          is_verrechnet?: boolean
          kunde_adresse?: string | null
          kunde_email?: string | null
          kunde_name: string
          kunde_ort?: string | null
          kunde_plz?: string | null
          kunde_telefon?: string | null
          notizen?: string | null
          pause_minutes?: number
          pdf_gesendet_am?: string | null
          pdf_path?: string | null
          project_id?: string | null
          start_time: string
          status?: string
          stunden: number
          unterschrift_am?: string | null
          unterschrift_kunde?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          beschreibung?: string
          created_at?: string
          customer_id?: string | null
          datum?: string
          end_time?: string
          id?: string
          is_verrechnet?: boolean
          kunde_adresse?: string | null
          kunde_email?: string | null
          kunde_name?: string
          kunde_ort?: string | null
          kunde_plz?: string | null
          kunde_telefon?: string | null
          notizen?: string | null
          pause_minutes?: number
          pdf_gesendet_am?: string | null
          pdf_path?: string | null
          project_id?: string | null
          start_time?: string
          status?: string
          stunden?: number
          unterschrift_am?: string | null
          unterschrift_kunde?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disturbances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disturbances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      document_texts: {
        Row: {
          created_at: string | null
          feld: string
          id: string
          inhalt: string
          sprache: string
          typ: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          feld: string
          id?: string
          inhalt: string
          sprache?: string
          typ: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          feld?: string
          id?: string
          inhalt?: string
          sprache?: string
          typ?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          beschreibung: string | null
          created_at: string
          file_hash: string | null
          file_url: string
          id: string
          name: string
          project_id: string
          typ: string
          user_id: string
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string
          file_hash?: string | null
          file_url: string
          id?: string
          name: string
          project_id: string
          typ: string
          user_id: string
        }
        Update: {
          beschreibung?: string | null
          created_at?: string
          file_hash?: string | null
          file_url?: string
          id?: string
          name?: string
          project_id?: string
          typ?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      einsaetze: {
        Row: {
          adresse: string | null
          beschreibung: string | null
          created_at: string | null
          created_by: string | null
          end_date: string
          end_time: string | null
          ganztaegig: boolean | null
          google_calendar_id: string | null
          google_event_id: string | null
          id: string
          name: string | null
          project_id: string
          start_date: string
          start_time: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          adresse?: string | null
          beschreibung?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date: string
          end_time?: string | null
          ganztaegig?: boolean | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          name?: string | null
          project_id: string
          start_date: string
          start_time?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          adresse?: string | null
          beschreibung?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          end_time?: string | null
          ganztaegig?: boolean | null
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          name?: string | null
          project_id?: string
          start_date?: string
          start_time?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "einsaetze_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "einsaetze_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_schedule_colors: {
        Row: {
          bg_color: string
          created_at: string | null
          employee_id: string
          id: string
          text_color: string
          updated_at: string | null
        }
        Insert: {
          bg_color?: string
          created_at?: string | null
          employee_id: string
          id?: string
          text_color?: string
          updated_at?: string | null
        }
        Update: {
          bg_color?: string
          created_at?: string | null
          employee_id?: string
          id?: string
          text_color?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_schedule_colors_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          abteilung: string | null
          adresse: string | null
          aktiv: boolean | null
          austritt_datum: string | null
          bank_name: string | null
          beschaeftigung_art: string | null
          bic: string | null
          created_at: string | null
          eintritt_datum: string | null
          email: string | null
          familienstand: string | null
          foto_url: string | null
          fuehrerschein: string | null
          geburtsdatum: string | null
          iban: string | null
          id: string
          ist_freelancer: boolean
          kinder: Json | null
          kleidungsgroesse: string | null
          land: string | null
          nachname: string
          nationalitaet: string | null
          notfallkontakt_beziehung: string | null
          notfallkontakt_name: string | null
          notfallkontakt_telefon: string | null
          notizen: string | null
          ort: string | null
          plz: string | null
          position: string | null
          schuhgroesse: string | null
          stundenlohn: number | null
          sv_nummer: string | null
          telefon: string | null
          updated_at: string | null
          user_id: string | null
          vorname: string
          whatsapp_aktiv: boolean | null
          whatsapp_last_evening_date: string | null
          whatsapp_last_morning_date: string | null
        }
        Insert: {
          abteilung?: string | null
          adresse?: string | null
          aktiv?: boolean | null
          austritt_datum?: string | null
          bank_name?: string | null
          beschaeftigung_art?: string | null
          bic?: string | null
          created_at?: string | null
          eintritt_datum?: string | null
          email?: string | null
          familienstand?: string | null
          foto_url?: string | null
          fuehrerschein?: string | null
          geburtsdatum?: string | null
          iban?: string | null
          id?: string
          ist_freelancer?: boolean
          kinder?: Json | null
          kleidungsgroesse?: string | null
          land?: string | null
          nachname: string
          nationalitaet?: string | null
          notfallkontakt_beziehung?: string | null
          notfallkontakt_name?: string | null
          notfallkontakt_telefon?: string | null
          notizen?: string | null
          ort?: string | null
          plz?: string | null
          position?: string | null
          schuhgroesse?: string | null
          stundenlohn?: number | null
          sv_nummer?: string | null
          telefon?: string | null
          updated_at?: string | null
          user_id?: string | null
          vorname: string
          whatsapp_aktiv?: boolean | null
          whatsapp_last_evening_date?: string | null
          whatsapp_last_morning_date?: string | null
        }
        Update: {
          abteilung?: string | null
          adresse?: string | null
          aktiv?: boolean | null
          austritt_datum?: string | null
          bank_name?: string | null
          beschaeftigung_art?: string | null
          bic?: string | null
          created_at?: string | null
          eintritt_datum?: string | null
          email?: string | null
          familienstand?: string | null
          foto_url?: string | null
          fuehrerschein?: string | null
          geburtsdatum?: string | null
          iban?: string | null
          id?: string
          ist_freelancer?: boolean
          kinder?: Json | null
          kleidungsgroesse?: string | null
          land?: string | null
          nachname?: string
          nationalitaet?: string | null
          notfallkontakt_beziehung?: string | null
          notfallkontakt_name?: string | null
          notfallkontakt_telefon?: string | null
          notizen?: string | null
          ort?: string | null
          plz?: string | null
          position?: string | null
          schuhgroesse?: string | null
          stundenlohn?: number | null
          sv_nummer?: string | null
          telefon?: string | null
          updated_at?: string | null
          user_id?: string | null
          vorname?: string
          whatsapp_aktiv?: boolean | null
          whatsapp_last_evening_date?: string | null
          whatsapp_last_morning_date?: string | null
        }
        Relationships: []
      }
      invitation_logs: {
        Row: {
          gesendet_am: string | null
          gesendet_von: string | null
          id: string
          status: string | null
          telefonnummer: string
        }
        Insert: {
          gesendet_am?: string | null
          gesendet_von?: string | null
          id?: string
          status?: string | null
          telefonnummer: string
        }
        Update: {
          gesendet_am?: string | null
          gesendet_von?: string | null
          id?: string
          status?: string | null
          telefonnummer?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          arbeitszeit_minuten: number
          aufschlag_prozent: number
          befestigung_preis: number
          beschreibung: string
          created_at: string
          einheit: string | null
          einzelpreis: number
          ek_preis: number
          gesamtpreis: number
          id: string
          invoice_id: string
          ist_kalkuliert: boolean
          kalkulation_template_id: string | null
          kurztext: string | null
          langtext: string | null
          menge: number
          mwst_exempt: boolean
          position: number
          produktnummer: string | null
          rabatt_prozent: number | null
          set_snapshot: Json | null
          set_template_id: string | null
          sonstiges_preis: number
          stundensatz: number
          verschnitt_prozent: number
        }
        Insert: {
          arbeitszeit_minuten?: number
          aufschlag_prozent?: number
          befestigung_preis?: number
          beschreibung: string
          created_at?: string
          einheit?: string | null
          einzelpreis?: number
          ek_preis?: number
          gesamtpreis?: number
          id?: string
          invoice_id: string
          ist_kalkuliert?: boolean
          kalkulation_template_id?: string | null
          kurztext?: string | null
          langtext?: string | null
          menge?: number
          mwst_exempt?: boolean
          position?: number
          produktnummer?: string | null
          rabatt_prozent?: number | null
          set_snapshot?: Json | null
          set_template_id?: string | null
          sonstiges_preis?: number
          stundensatz?: number
          verschnitt_prozent?: number
        }
        Update: {
          arbeitszeit_minuten?: number
          aufschlag_prozent?: number
          befestigung_preis?: number
          beschreibung?: string
          created_at?: string
          einheit?: string | null
          einzelpreis?: number
          ek_preis?: number
          gesamtpreis?: number
          id?: string
          invoice_id?: string
          ist_kalkuliert?: boolean
          kalkulation_template_id?: string | null
          kurztext?: string | null
          langtext?: string | null
          menge?: number
          mwst_exempt?: boolean
          position?: number
          produktnummer?: string | null
          rabatt_prozent?: number | null
          set_snapshot?: Json | null
          set_template_id?: string | null
          sonstiges_preis?: number
          stundensatz?: number
          verschnitt_prozent?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_kalkulation_template_id_fkey"
            columns: ["kalkulation_template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_set_template_id_fkey"
            columns: ["set_template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          betrag: number
          created_at: string | null
          datum: string
          id: string
          invoice_id: string
          notizen: string | null
        }
        Insert: {
          betrag: number
          created_at?: string | null
          datum?: string
          id?: string
          invoice_id: string
          notizen?: string | null
        }
        Update: {
          betrag?: number
          created_at?: string | null
          datum?: string
          id?: string
          invoice_id?: string
          notizen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_template_components: {
        Row: {
          component_template_id: string
          created_at: string | null
          id: string
          menge: number
          parent_template_id: string
          sort_order: number | null
        }
        Insert: {
          component_template_id: string
          created_at?: string | null
          id?: string
          menge?: number
          parent_template_id: string
          sort_order?: number | null
        }
        Update: {
          component_template_id?: string
          created_at?: string | null
          id?: string
          menge?: number
          parent_template_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_template_components_component_template_id_fkey"
            columns: ["component_template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_template_components_parent_template_id_fkey"
            columns: ["parent_template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_templates: {
        Row: {
          arbeitszeit_minuten: number
          artikelnummer: string | null
          aufschlag_prozent: number | null
          befestigung_preis: number
          beschreibung: string
          bezugseinheit: string | null
          brutto_preis: number | null
          created_at: string | null
          einheit: string | null
          einzelpreis: number | null
          ek_netto: number | null
          foto_path: string | null
          id: string
          ist_aktiv: boolean | null
          ist_kalkuliert: boolean
          ist_lagerartikel: boolean | null
          ist_set: boolean | null
          kategorie: string | null
          kurzbezeichnung: string | null
          langbezeichnung: string | null
          lieferant: string | null
          name: string
          netto_preis: number | null
          produktgruppe: string | null
          produktnummer: string | null
          sonstiges_preis: number
          stundensatz: number
          user_id: string
          ust_satz: number | null
          verschnitt_prozent: number
          vk_netto: number | null
          vk_preis_manuell: boolean | null
        }
        Insert: {
          arbeitszeit_minuten?: number
          artikelnummer?: string | null
          aufschlag_prozent?: number | null
          befestigung_preis?: number
          beschreibung: string
          bezugseinheit?: string | null
          brutto_preis?: number | null
          created_at?: string | null
          einheit?: string | null
          einzelpreis?: number | null
          ek_netto?: number | null
          foto_path?: string | null
          id?: string
          ist_aktiv?: boolean | null
          ist_kalkuliert?: boolean
          ist_lagerartikel?: boolean | null
          ist_set?: boolean | null
          kategorie?: string | null
          kurzbezeichnung?: string | null
          langbezeichnung?: string | null
          lieferant?: string | null
          name: string
          netto_preis?: number | null
          produktgruppe?: string | null
          produktnummer?: string | null
          sonstiges_preis?: number
          stundensatz?: number
          user_id: string
          ust_satz?: number | null
          verschnitt_prozent?: number
          vk_netto?: number | null
          vk_preis_manuell?: boolean | null
        }
        Update: {
          arbeitszeit_minuten?: number
          artikelnummer?: string | null
          aufschlag_prozent?: number | null
          befestigung_preis?: number
          beschreibung?: string
          bezugseinheit?: string | null
          brutto_preis?: number | null
          created_at?: string | null
          einheit?: string | null
          einzelpreis?: number | null
          ek_netto?: number | null
          foto_path?: string | null
          id?: string
          ist_aktiv?: boolean | null
          ist_kalkuliert?: boolean
          ist_lagerartikel?: boolean | null
          ist_set?: boolean | null
          kategorie?: string | null
          kurzbezeichnung?: string | null
          langbezeichnung?: string | null
          lieferant?: string | null
          name?: string
          netto_preis?: number | null
          produktgruppe?: string | null
          produktnummer?: string | null
          sonstiges_preis?: number
          stundensatz?: number
          user_id?: string
          ust_satz?: number | null
          verschnitt_prozent?: number
          vk_netto?: number | null
          vk_preis_manuell?: boolean | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          allgemeine_angaben_aktiv: boolean
          ansprechpartner_email: string | null
          ansprechpartner_employee_id: string | null
          ansprechpartner_name: string | null
          ansprechpartner_telefon: string | null
          anzahlung_betrag: number | null
          anzahlung_prozent: number | null
          archiviert: boolean | null
          ausfuehrende_firma: string | null
          ausfuehrende_firma_freitext: string | null
          ausfuehrungs_kw: string | null
          ausfuehrungsort: string | null
          betreff: string | null
          bezahlt_betrag: number | null
          brutto_summe: number
          created_at: string
          customer_id: string | null
          datum: string
          faellig_am: string | null
          gueltig_bis: string | null
          id: string
          jahr: number
          kalkulation_aufschlag_override: number | null
          kunde_adresse: string | null
          kunde_anrede: string | null
          kunde_email: string | null
          kunde_land: string | null
          kunde_name: string
          kunde_ort: string | null
          kunde_plz: string | null
          kunde_telefon: string | null
          kunde_titel: string | null
          kunde_uid: string | null
          kundennummer: string | null
          laufnummer: number
          leistungsbeschreibung: string | null
          leistungsdatum: string | null
          leistungsdatum_bis: string | null
          mahnstufe: number | null
          mwst_betrag: number
          mwst_satz: number
          netto_summe: number
          notizen: string | null
          nummer: string
          parent_invoice_id: string | null
          project_id: string | null
          rabatt_betrag: number | null
          rabatt_prozent: number | null
          reverse_charge: boolean | null
          skonto_prozent: number | null
          skonto_tage: number | null
          status: string
          storno_datum: string | null
          storno_grund: string | null
          storno_nummer: string | null
          typ: string
          updated_at: string
          user_id: string
          verrechnet_am: string | null
          verrechnet_mit_invoice_id: string | null
          zahlungsbedingungen: string | null
        }
        Insert: {
          allgemeine_angaben_aktiv?: boolean
          ansprechpartner_email?: string | null
          ansprechpartner_employee_id?: string | null
          ansprechpartner_name?: string | null
          ansprechpartner_telefon?: string | null
          anzahlung_betrag?: number | null
          anzahlung_prozent?: number | null
          archiviert?: boolean | null
          ausfuehrende_firma?: string | null
          ausfuehrende_firma_freitext?: string | null
          ausfuehrungs_kw?: string | null
          ausfuehrungsort?: string | null
          betreff?: string | null
          bezahlt_betrag?: number | null
          brutto_summe?: number
          created_at?: string
          customer_id?: string | null
          datum?: string
          faellig_am?: string | null
          gueltig_bis?: string | null
          id?: string
          jahr?: number
          kalkulation_aufschlag_override?: number | null
          kunde_adresse?: string | null
          kunde_anrede?: string | null
          kunde_email?: string | null
          kunde_land?: string | null
          kunde_name: string
          kunde_ort?: string | null
          kunde_plz?: string | null
          kunde_telefon?: string | null
          kunde_titel?: string | null
          kunde_uid?: string | null
          kundennummer?: string | null
          laufnummer: number
          leistungsbeschreibung?: string | null
          leistungsdatum?: string | null
          leistungsdatum_bis?: string | null
          mahnstufe?: number | null
          mwst_betrag?: number
          mwst_satz?: number
          netto_summe?: number
          notizen?: string | null
          nummer: string
          parent_invoice_id?: string | null
          project_id?: string | null
          rabatt_betrag?: number | null
          rabatt_prozent?: number | null
          reverse_charge?: boolean | null
          skonto_prozent?: number | null
          skonto_tage?: number | null
          status?: string
          storno_datum?: string | null
          storno_grund?: string | null
          storno_nummer?: string | null
          typ?: string
          updated_at?: string
          user_id: string
          verrechnet_am?: string | null
          verrechnet_mit_invoice_id?: string | null
          zahlungsbedingungen?: string | null
        }
        Update: {
          allgemeine_angaben_aktiv?: boolean
          ansprechpartner_email?: string | null
          ansprechpartner_employee_id?: string | null
          ansprechpartner_name?: string | null
          ansprechpartner_telefon?: string | null
          anzahlung_betrag?: number | null
          anzahlung_prozent?: number | null
          archiviert?: boolean | null
          ausfuehrende_firma?: string | null
          ausfuehrende_firma_freitext?: string | null
          ausfuehrungs_kw?: string | null
          ausfuehrungsort?: string | null
          betreff?: string | null
          bezahlt_betrag?: number | null
          brutto_summe?: number
          created_at?: string
          customer_id?: string | null
          datum?: string
          faellig_am?: string | null
          gueltig_bis?: string | null
          id?: string
          jahr?: number
          kalkulation_aufschlag_override?: number | null
          kunde_adresse?: string | null
          kunde_anrede?: string | null
          kunde_email?: string | null
          kunde_land?: string | null
          kunde_name?: string
          kunde_ort?: string | null
          kunde_plz?: string | null
          kunde_telefon?: string | null
          kunde_titel?: string | null
          kunde_uid?: string | null
          kundennummer?: string | null
          laufnummer?: number
          leistungsbeschreibung?: string | null
          leistungsdatum?: string | null
          leistungsdatum_bis?: string | null
          mahnstufe?: number | null
          mwst_betrag?: number
          mwst_satz?: number
          netto_summe?: number
          notizen?: string | null
          nummer?: string
          parent_invoice_id?: string | null
          project_id?: string | null
          rabatt_betrag?: number | null
          rabatt_prozent?: number | null
          reverse_charge?: boolean | null
          skonto_prozent?: number | null
          skonto_tage?: number | null
          status?: string
          storno_datum?: string | null
          storno_grund?: string | null
          storno_nummer?: string | null
          typ?: string
          updated_at?: string
          user_id?: string
          verrechnet_am?: string | null
          verrechnet_mit_invoice_id?: string | null
          zahlungsbedingungen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_ansprechpartner_employee_id_fkey"
            columns: ["ansprechpartner_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_verrechnet_mit_invoice_id_fkey"
            columns: ["verrechnet_mit_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          created_at: string
          id: string
          total_days: number
          updated_at: string
          used_days: number
          user_id: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          total_days?: number
          updated_at?: string
          used_days?: number
          user_id: string
          year?: number
        }
        Update: {
          created_at?: string
          id?: string
          total_days?: number
          updated_at?: string
          used_days?: number
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number
          end_date: string
          id: string
          notizen: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days?: number
          end_date: string
          id?: string
          notizen?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days?: number
          end_date?: string
          id?: string
          notizen?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mahnung_history: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          mahnstufe: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          mahnstufe: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          mahnstufe?: number
        }
        Relationships: [
          {
            foreignKeyName: "mahnung_history_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      material_entries: {
        Row: {
          created_at: string
          datum: string | null
          disturbance_id: string | null
          einheit: string | null
          einzelpreis: number | null
          id: string
          lieferschein_id: string | null
          material: string
          menge: string | null
          notizen: string | null
          project_id: string | null
          typ: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          datum?: string | null
          disturbance_id?: string | null
          einheit?: string | null
          einzelpreis?: number | null
          id?: string
          lieferschein_id?: string | null
          material: string
          menge?: string | null
          notizen?: string | null
          project_id?: string | null
          typ?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          datum?: string | null
          disturbance_id?: string | null
          einheit?: string | null
          einzelpreis?: number | null
          id?: string
          lieferschein_id?: string | null
          material?: string
          menge?: string | null
          notizen?: string | null
          project_id?: string | null
          typ?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_entries_disturbance_id_fkey"
            columns: ["disturbance_id"]
            isOneToOne: false
            referencedRelation: "disturbances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      number_ranges: {
        Row: {
          aktuelle_nummer: number | null
          created_at: string | null
          format_pattern: string | null
          id: string
          jahr_format: string | null
          label: string
          prefix: string | null
          start_nummer: number | null
          stellen: number | null
          suffix: string | null
          typ: string
          updated_at: string | null
        }
        Insert: {
          aktuelle_nummer?: number | null
          created_at?: string | null
          format_pattern?: string | null
          id?: string
          jahr_format?: string | null
          label: string
          prefix?: string | null
          start_nummer?: number | null
          stellen?: number | null
          suffix?: string | null
          typ: string
          updated_at?: string | null
        }
        Update: {
          aktuelle_nummer?: number | null
          created_at?: string | null
          format_pattern?: string | null
          id?: string
          jahr_format?: string | null
          label?: string
          prefix?: string | null
          start_nummer?: number | null
          stellen?: number | null
          suffix?: string | null
          typ?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      offer_package_items: {
        Row: {
          beschreibung: string
          created_at: string
          default_menge: number | null
          einheit: string | null
          einzelpreis: number | null
          id: string
          package_id: string
          sort_order: number | null
          template_id: string | null
        }
        Insert: {
          beschreibung: string
          created_at?: string
          default_menge?: number | null
          einheit?: string | null
          einzelpreis?: number | null
          id?: string
          package_id: string
          sort_order?: number | null
          template_id?: string | null
        }
        Update: {
          beschreibung?: string
          created_at?: string
          default_menge?: number | null
          einheit?: string | null
          einzelpreis?: number | null
          id?: string
          package_id?: string
          sort_order?: number | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offer_package_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "offer_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_package_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "invoice_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_packages: {
        Row: {
          beschreibung: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          beschreibung?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          beschreibung?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          adresse: string | null
          anleitung_completed: boolean | null
          created_at: string
          eintrittsdatum: string | null
          email: string | null
          geburtsdatum: string | null
          hidden: boolean
          id: string
          is_active: boolean | null
          must_change_password: boolean | null
          nachname: string
          ort: string | null
          plz: string | null
          stundenlohn: number | null
          sv_nummer: string | null
          telefon: string | null
          updated_at: string
          username: string | null
          vorname: string
        }
        Insert: {
          adresse?: string | null
          anleitung_completed?: boolean | null
          created_at?: string
          eintrittsdatum?: string | null
          email?: string | null
          geburtsdatum?: string | null
          hidden?: boolean
          id: string
          is_active?: boolean | null
          must_change_password?: boolean | null
          nachname: string
          ort?: string | null
          plz?: string | null
          stundenlohn?: number | null
          sv_nummer?: string | null
          telefon?: string | null
          updated_at?: string
          username?: string | null
          vorname: string
        }
        Update: {
          adresse?: string | null
          anleitung_completed?: boolean | null
          created_at?: string
          eintrittsdatum?: string | null
          email?: string | null
          geburtsdatum?: string | null
          hidden?: boolean
          id?: string
          is_active?: boolean | null
          must_change_password?: boolean | null
          nachname?: string
          ort?: string | null
          plz?: string | null
          stundenlohn?: number | null
          sv_nummer?: string | null
          telefon?: string | null
          updated_at?: string
          username?: string | null
          vorname?: string
        }
        Relationships: []
      }
      project_daily_targets: {
        Row: {
          created_at: string | null
          created_by: string
          datum: string
          id: string
          nachkalkulation_stunden: number | null
          notizen: string | null
          project_id: string
          tagesziel: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          datum: string
          id?: string
          nachkalkulation_stunden?: number | null
          notizen?: string | null
          project_id: string
          tagesziel?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          datum?: string
          id?: string
          nachkalkulation_stunden?: number | null
          notizen?: string | null
          project_id?: string
          tagesziel?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_daily_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_daily_targets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_statuses: {
        Row: {
          created_at: string | null
          farbe_bg: string
          farbe_text: string
          id: string
          is_default: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          farbe_bg?: string
          farbe_text?: string
          id?: string
          is_default?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          farbe_bg?: string
          farbe_text?: string
          id?: string
          is_default?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          adresse: string | null
          auftragsvolumen: number | null
          bauleiter_id: string | null
          bereich: string | null
          beschreibung: string | null
          budget: number | null
          created_at: string
          customer_id: string | null
          erfasst_am: string | null
          erfasst_von: string | null
          erfassungsdatum: string | null
          geplanter_start: string | null
          geplantes_ende: string | null
          id: string
          kategorie: string | null
          land: string | null
          leistungsarten: Json | null
          name: string
          ort: string | null
          plz: string
          prioritaet: string | null
          projekt_kontakt_name: string | null
          projekt_kontakt_telefon: string | null
          projekt_typ: string | null
          projektart: string | null
          projektnummer: string | null
          projektverantwortlicher_id: string | null
          status: string | null
          updated_at: string
          user_id: string | null
          verantwortlicher_id: string | null
          wegbeschreibung: string | null
          zugewiesene_mitarbeiter: Json | null
          zusatzinfos: string | null
        }
        Insert: {
          adresse?: string | null
          auftragsvolumen?: number | null
          bauleiter_id?: string | null
          bereich?: string | null
          beschreibung?: string | null
          budget?: number | null
          created_at?: string
          customer_id?: string | null
          erfasst_am?: string | null
          erfasst_von?: string | null
          erfassungsdatum?: string | null
          geplanter_start?: string | null
          geplantes_ende?: string | null
          id?: string
          kategorie?: string | null
          land?: string | null
          leistungsarten?: Json | null
          name: string
          ort?: string | null
          plz: string
          prioritaet?: string | null
          projekt_kontakt_name?: string | null
          projekt_kontakt_telefon?: string | null
          projekt_typ?: string | null
          projektart?: string | null
          projektnummer?: string | null
          projektverantwortlicher_id?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
          verantwortlicher_id?: string | null
          wegbeschreibung?: string | null
          zugewiesene_mitarbeiter?: Json | null
          zusatzinfos?: string | null
        }
        Update: {
          adresse?: string | null
          auftragsvolumen?: number | null
          bauleiter_id?: string | null
          bereich?: string | null
          beschreibung?: string | null
          budget?: number | null
          created_at?: string
          customer_id?: string | null
          erfasst_am?: string | null
          erfasst_von?: string | null
          erfassungsdatum?: string | null
          geplanter_start?: string | null
          geplantes_ende?: string | null
          id?: string
          kategorie?: string | null
          land?: string | null
          leistungsarten?: Json | null
          name?: string
          ort?: string | null
          plz?: string
          prioritaet?: string | null
          projekt_kontakt_name?: string | null
          projekt_kontakt_telefon?: string | null
          projekt_typ?: string | null
          projektart?: string | null
          projektnummer?: string | null
          projektverantwortlicher_id?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string | null
          verantwortlicher_id?: string | null
          wegbeschreibung?: string | null
          zugewiesene_mitarbeiter?: Json | null
          zusatzinfos?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_bauleiter_id_fkey"
            columns: ["bauleiter_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_verantwortlicher_id_fkey"
            columns: ["verantwortlicher_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_invoices: {
        Row: {
          beleg_locked: boolean | null
          betrag_brutto: number
          betrag_netto: number | null
          bezahlt_am: string | null
          created_at: string | null
          created_by: string | null
          faellig_am: string | null
          file_name: string | null
          id: string
          kategorie: string | null
          lieferant: string
          mime_type: string | null
          notizen: string | null
          pdf_path: string | null
          project_id: string | null
          rechnungsdatum: string | null
          rechnungsnummer: string | null
          status: string | null
          updated_at: string | null
          ust_satz: number | null
          verrechnet_am: string | null
          verrechnet_in_invoice_id: string | null
          zahlungsart: string | null
        }
        Insert: {
          beleg_locked?: boolean | null
          betrag_brutto: number
          betrag_netto?: number | null
          bezahlt_am?: string | null
          created_at?: string | null
          created_by?: string | null
          faellig_am?: string | null
          file_name?: string | null
          id?: string
          kategorie?: string | null
          lieferant: string
          mime_type?: string | null
          notizen?: string | null
          pdf_path?: string | null
          project_id?: string | null
          rechnungsdatum?: string | null
          rechnungsnummer?: string | null
          status?: string | null
          updated_at?: string | null
          ust_satz?: number | null
          verrechnet_am?: string | null
          verrechnet_in_invoice_id?: string | null
          zahlungsart?: string | null
        }
        Update: {
          beleg_locked?: boolean | null
          betrag_brutto?: number
          betrag_netto?: number | null
          bezahlt_am?: string | null
          created_at?: string | null
          created_by?: string | null
          faellig_am?: string | null
          file_name?: string | null
          id?: string
          kategorie?: string | null
          lieferant?: string
          mime_type?: string | null
          notizen?: string | null
          pdf_path?: string | null
          project_id?: string | null
          rechnungsdatum?: string | null
          rechnungsnummer?: string | null
          status?: string | null
          updated_at?: string | null
          ust_satz?: number | null
          verrechnet_am?: string | null
          verrechnet_in_invoice_id?: string | null
          zahlungsart?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_invoices_verrechnet_in_invoice_id_fkey"
            columns: ["verrechnet_in_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          arbeitszeit: number
          beschreibung: string
          created_at: string
          datum: string
          id: string
          project_id: string
          unterschrift_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          arbeitszeit: number
          beschreibung: string
          created_at?: string
          datum: string
          id?: string
          project_id: string
          unterschrift_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          arbeitszeit?: number
          beschreibung?: string
          created_at?: string
          datum?: string
          id?: string
          project_id?: string
          unterschrift_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string | null
          feature: string
          id: string
          role: string
          updated_at: string | null
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string | null
          feature: string
          id?: string
          role: string
          updated_at?: string | null
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string | null
          feature?: string
          id?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string | null
          id: string
          sort_order: number | null
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          sort_order?: number | null
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          sort_order?: number | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      time_account_transactions: {
        Row: {
          balance_after: number
          balance_before: number
          change_type: string
          changed_by: string
          created_at: string
          hours: number
          id: string
          reason: string | null
          reference_id: string | null
          user_id: string
        }
        Insert: {
          balance_after: number
          balance_before: number
          change_type: string
          changed_by: string
          created_at?: string
          hours: number
          id?: string
          reason?: string | null
          reference_id?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          balance_before?: number
          change_type?: string
          changed_by?: string
          created_at?: string
          hours?: number
          id?: string
          reason?: string | null
          reference_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      time_accounts: {
        Row: {
          balance_hours: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_hours?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_hours?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          approved: boolean | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          datum: string
          disturbance_id: string | null
          end_time: string
          id: string
          kfz_id: string | null
          km_ende: number | null
          km_start: number | null
          location_type: string | null
          nachgetragen_am: string | null
          nachgetragen_von: string | null
          notizen: string | null
          pause_end: string | null
          pause_minutes: number
          pause_start: string | null
          project_id: string | null
          start_time: string
          stunden: number
          taetigkeit: string | null
          updated_at: string
          user_id: string
          week_type: string | null
          wetterschicht_stunden: number | null
        }
        Insert: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          datum: string
          disturbance_id?: string | null
          end_time: string
          id?: string
          kfz_id?: string | null
          km_ende?: number | null
          km_start?: number | null
          location_type?: string | null
          nachgetragen_am?: string | null
          nachgetragen_von?: string | null
          notizen?: string | null
          pause_end?: string | null
          pause_minutes?: number
          pause_start?: string | null
          project_id?: string | null
          start_time: string
          stunden: number
          taetigkeit?: string | null
          updated_at?: string
          user_id: string
          week_type?: string | null
          wetterschicht_stunden?: number | null
        }
        Update: {
          approved?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          datum?: string
          disturbance_id?: string | null
          end_time?: string
          id?: string
          kfz_id?: string | null
          km_ende?: number | null
          km_start?: number | null
          location_type?: string | null
          nachgetragen_am?: string | null
          nachgetragen_von?: string | null
          notizen?: string | null
          pause_end?: string | null
          pause_minutes?: number
          pause_start?: string | null
          project_id?: string | null
          start_time?: string
          stunden?: number
          taetigkeit?: string | null
          updated_at?: string
          user_id?: string
          week_type?: string | null
          wetterschicht_stunden?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_disturbance_id_fkey"
            columns: ["disturbance_id"]
            isOneToOne: false
            referencedRelation: "disturbances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_kfz_id_fkey"
            columns: ["kfz_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_vehicles: {
        Row: {
          created_at: string | null
          id: string
          km_ende: number | null
          km_gefahren: number | null
          km_start: number | null
          modus: string
          time_entry_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          km_ende?: number | null
          km_gefahren?: number | null
          km_start?: number | null
          modus: string
          time_entry_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          km_ende?: number | null
          km_gefahren?: number | null
          km_start?: number | null
          modus?: string
          time_entry_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_vehicles_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_vehicles_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entry_workers: {
        Row: {
          created_at: string
          id: string
          source_entry_id: string
          target_entry_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_entry_id: string
          target_entry_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source_entry_id?: string
          target_entry_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entry_workers_source_entry_id_fkey"
            columns: ["source_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entry_workers_target_entry_id_fkey"
            columns: ["target_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_overrides: {
        Row: {
          override_role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          override_role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          override_role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          aktiv: boolean | null
          bezeichnung: string
          created_at: string | null
          id: string
          kennzeichen: string | null
          notizen: string | null
          typ: string | null
          updated_at: string | null
        }
        Insert: {
          aktiv?: boolean | null
          bezeichnung: string
          created_at?: string | null
          id?: string
          kennzeichen?: string | null
          notizen?: string | null
          typ?: string | null
          updated_at?: string | null
        }
        Update: {
          aktiv?: boolean | null
          bezeichnung?: string
          created_at?: string | null
          id?: string
          kennzeichen?: string | null
          notizen?: string | null
          typ?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      week_settings: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
          week_start: string
          week_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          week_start: string
          week_type: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          week_start?: string
          week_type?: string
        }
        Relationships: []
      }
      worker_assignments_legacy: {
        Row: {
          created_at: string | null
          created_by: string
          datum: string
          end_time: string | null
          google_event_id: string | null
          id: string
          notizen: string | null
          project_id: string
          start_time: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          datum: string
          end_time?: string | null
          google_event_id?: string | null
          id?: string
          notizen?: string | null
          project_id: string
          start_time?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          datum?: string
          end_time?: string | null
          google_event_id?: string | null
          id?: string
          notizen?: string | null
          project_id?: string
          start_time?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_user: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: Json
      }
      debug_user_project_access: {
        Args: { p_user_id: string }
        Returns: {
          accessible_count: number
          employee_id: string
          role: string
          total_active_count: number
        }[]
      }
      ensure_user_profile: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      is_austrian_holiday: { Args: { d: string }; Returns: boolean }
      list_accessible_project_ids_for_user: {
        Args: { p_only_active?: boolean; p_user_id: string }
        Returns: {
          id: string
          name: string
          status: string
        }[]
      }
      next_document_number: {
        Args: { p_jahr?: number; p_typ: string }
        Returns: string
      }
      next_invoice_number: {
        Args: { p_jahr: number; p_typ: string }
        Returns: string
      }
      next_storno_nummer: { Args: { p_jahr?: number }; Returns: string }
      set_employee_project_access: {
        Args: { p_employee_id: string; p_project_ids: string[] }
        Returns: Json
      }
      try_claim_photo_prompt: {
        Args: { p_ttl_seconds?: number; p_user_id: string }
        Returns: boolean
      }
      user_can_access_project: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "administrator" | "mitarbeiter" | "vorarbeiter"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["administrator", "mitarbeiter", "vorarbeiter"],
    },
  },
} as const
