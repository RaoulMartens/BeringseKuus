// Gegenereerd met `npm run types:db` uit de lokale database (de migraties). Niet met de hand wijzigen: de poort
// maakt dit bestand opnieuw en keurt een verschil af (scripts/controleer-dbtypen.ts).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      activiteit_groep: {
        Row: {
          activiteit_id: string;
          groep_id: string;
        };
        ComputedFields: never;
        Insert: {
          activiteit_id: string;
          groep_id: string;
        };
        Update: {
          activiteit_id?: string;
          groep_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'activiteit_groep_activiteit_id_fkey';
            columns: ['activiteit_id'];
            isOneToOne: false;
            referencedRelation: 'activiteiten';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activiteit_groep_activiteit_id_fkey';
            columns: ['activiteit_id'];
            isOneToOne: false;
            referencedRelation: 'mijn_activiteiten';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activiteit_groep_groep_id_fkey';
            columns: ['groep_id'];
            isOneToOne: false;
            referencedRelation: 'groepen';
            referencedColumns: ['id'];
          },
        ];
      };
      activiteiten: {
        Row: {
          aangemaakt: string;
          afmeld_deadline: string | null;
          bak_actief: boolean;
          begint_om: string;
          bijgewerkt: string;
          bron_activiteit_id: string | null;
          bus_locatie: string | null;
          bus_vertrektijd: string | null;
          datum: string;
          eindigt_om: string;
          eindtijd: string | null;
          id: string;
          locatie: string | null;
          min_aanwezigen: number | null;
          naam: string;
          notitie: string | null;
          seizoen: number;
          starttijd: string | null;
          status: string;
          type: string;
          vereniging_id: string;
          verzameltijd: string | null;
        };
        ComputedFields: never;
        Insert: {
          aangemaakt?: string;
          afmeld_deadline?: string | null;
          bak_actief?: boolean;
          begint_om?: never;
          bijgewerkt?: string;
          bron_activiteit_id?: string | null;
          bus_locatie?: string | null;
          bus_vertrektijd?: string | null;
          datum: string;
          eindigt_om?: never;
          eindtijd?: string | null;
          id?: string;
          locatie?: string | null;
          min_aanwezigen?: number | null;
          naam: string;
          notitie?: string | null;
          seizoen?: never;
          starttijd?: string | null;
          status?: string;
          type?: string;
          vereniging_id?: string;
          verzameltijd?: string | null;
        };
        Update: {
          aangemaakt?: string;
          afmeld_deadline?: string | null;
          bak_actief?: boolean;
          begint_om?: never;
          bijgewerkt?: string;
          bron_activiteit_id?: string | null;
          bus_locatie?: string | null;
          bus_vertrektijd?: string | null;
          datum?: string;
          eindigt_om?: never;
          eindtijd?: string | null;
          id?: string;
          locatie?: string | null;
          min_aanwezigen?: number | null;
          naam?: string;
          notitie?: string | null;
          seizoen?: never;
          starttijd?: string | null;
          status?: string;
          type?: string;
          vereniging_id?: string;
          verzameltijd?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'activiteiten_bron_activiteit_id_fkey';
            columns: ['bron_activiteit_id'];
            isOneToOne: false;
            referencedRelation: 'activiteiten';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activiteiten_bron_activiteit_id_fkey';
            columns: ['bron_activiteit_id'];
            isOneToOne: false;
            referencedRelation: 'mijn_activiteiten';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activiteiten_vereniging_id_fkey';
            columns: ['vereniging_id'];
            isOneToOne: false;
            referencedRelation: 'verenigingen';
            referencedColumns: ['id'];
          },
        ];
      };
      afmeldingen: {
        Row: {
          aangemaakt: string;
          activiteit_id: string;
          id: string;
          lid_id: string;
          toelichting: string | null;
        };
        ComputedFields: never;
        Insert: {
          aangemaakt?: string;
          activiteit_id: string;
          id?: string;
          lid_id: string;
          toelichting?: string | null;
        };
        Update: {
          aangemaakt?: string;
          activiteit_id?: string;
          id?: string;
          lid_id?: string;
          toelichting?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'afmeldingen_activiteit_id_fkey';
            columns: ['activiteit_id'];
            isOneToOne: false;
            referencedRelation: 'activiteiten';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'afmeldingen_activiteit_id_fkey';
            columns: ['activiteit_id'];
            isOneToOne: false;
            referencedRelation: 'mijn_activiteiten';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'afmeldingen_lid_id_fkey';
            columns: ['lid_id'];
            isOneToOne: false;
            referencedRelation: 'leden';
            referencedColumns: ['id'];
          },
        ];
      };
      groepen: {
        Row: {
          id: string;
          naam: string;
          vereniging_id: string;
          volgorde: number;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          naam: string;
          vereniging_id?: string;
          volgorde: number;
        };
        Update: {
          id?: string;
          naam?: string;
          vereniging_id?: string;
          volgorde?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'groepen_vereniging_id_fkey';
            columns: ['vereniging_id'];
            isOneToOne: false;
            referencedRelation: 'verenigingen';
            referencedColumns: ['id'];
          },
        ];
      };
      leden: {
        Row: {
          aangemaakt: string;
          achternaam: string;
          actief: boolean;
          auth_user_id: string | null;
          id: string;
          type: string;
          vereniging_id: string;
          voornaam: string;
        };
        ComputedFields: never;
        Insert: {
          aangemaakt?: string;
          achternaam: string;
          actief?: boolean;
          auth_user_id?: string | null;
          id?: string;
          type: string;
          vereniging_id?: string;
          voornaam: string;
        };
        Update: {
          aangemaakt?: string;
          achternaam?: string;
          actief?: boolean;
          auth_user_id?: string | null;
          id?: string;
          type?: string;
          vereniging_id?: string;
          voornaam?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'leden_vereniging_id_fkey';
            columns: ['vereniging_id'];
            isOneToOne: false;
            referencedRelation: 'verenigingen';
            referencedColumns: ['id'];
          },
        ];
      };
      leden_prive: {
        Row: {
          beheerder_sinds: string | null;
          email: string;
          is_admin: boolean;
          lid_id: string;
          mag_bob: boolean;
          mag_eindverantw: boolean;
          telefoon: string | null;
        };
        ComputedFields: never;
        Insert: {
          beheerder_sinds?: string | null;
          email: string;
          is_admin?: boolean;
          lid_id: string;
          mag_bob?: boolean;
          mag_eindverantw?: boolean;
          telefoon?: string | null;
        };
        Update: {
          beheerder_sinds?: string | null;
          email?: string;
          is_admin?: boolean;
          lid_id?: string;
          mag_bob?: boolean;
          mag_eindverantw?: boolean;
          telefoon?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'leden_prive_lid_id_fkey';
            columns: ['lid_id'];
            isOneToOne: true;
            referencedRelation: 'leden';
            referencedColumns: ['id'];
          },
        ];
      };
      lid_groep: {
        Row: {
          groep_id: string;
          lid_id: string;
        };
        ComputedFields: never;
        Insert: {
          groep_id: string;
          lid_id: string;
        };
        Update: {
          groep_id?: string;
          lid_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'lid_groep_groep_id_fkey';
            columns: ['groep_id'];
            isOneToOne: false;
            referencedRelation: 'groepen';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lid_groep_lid_id_fkey';
            columns: ['lid_id'];
            isOneToOne: false;
            referencedRelation: 'leden';
            referencedColumns: ['id'];
          },
        ];
      };
      rol_slots: {
        Row: {
          activiteit_id: string;
          bezetter_id: string | null;
          id: string;
          plek_label: string | null;
          rol_type: string;
          volgorde: number;
        };
        ComputedFields: never;
        Insert: {
          activiteit_id: string;
          bezetter_id?: string | null;
          id?: string;
          plek_label?: string | null;
          rol_type: string;
          volgorde?: number;
        };
        Update: {
          activiteit_id?: string;
          bezetter_id?: string | null;
          id?: string;
          plek_label?: string | null;
          rol_type?: string;
          volgorde?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'rol_slots_activiteit_id_fkey';
            columns: ['activiteit_id'];
            isOneToOne: false;
            referencedRelation: 'activiteiten';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rol_slots_activiteit_id_fkey';
            columns: ['activiteit_id'];
            isOneToOne: false;
            referencedRelation: 'mijn_activiteiten';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rol_slots_bezetter_id_fkey';
            columns: ['bezetter_id'];
            isOneToOne: false;
            referencedRelation: 'leden';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rol_slots_rol_type_fkey';
            columns: ['rol_type'];
            isOneToOne: false;
            referencedRelation: 'roltypen';
            referencedColumns: ['code'];
          },
        ];
      };
      roltypen: {
        Row: {
          alleen_admin: boolean;
          code: string;
          naam: string;
          ruilbaar_door_lid: boolean;
          volgorde: number;
        };
        ComputedFields: never;
        Insert: {
          alleen_admin: boolean;
          code: string;
          naam: string;
          ruilbaar_door_lid: boolean;
          volgorde: number;
        };
        Update: {
          alleen_admin?: boolean;
          code?: string;
          naam?: string;
          ruilbaar_door_lid?: boolean;
          volgorde?: number;
        };
        Relationships: [];
      };
      verenigingen: {
        Row: {
          id: string;
          naam: string;
        };
        ComputedFields: never;
        Insert: {
          id: string;
          naam: string;
        };
        Update: {
          id?: string;
          naam?: string;
        };
        Relationships: [];
      };
      verenigingsinstellingen: {
        Row: {
          bus_vertrekplaats: string | null;
          vereniging_id: string;
        };
        ComputedFields: never;
        Insert: {
          bus_vertrekplaats?: string | null;
          vereniging_id?: string;
        };
        Update: {
          bus_vertrekplaats?: string | null;
          vereniging_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'verenigingsinstellingen_vereniging_id_fkey';
            columns: ['vereniging_id'];
            isOneToOne: true;
            referencedRelation: 'verenigingen';
            referencedColumns: ['id'];
          },
        ];
      };
      wijzigingen_log: {
        Row: {
          actie: string;
          door_lid_id: string | null;
          id: number;
          moment: string;
          omschrijving: string;
          rij_id: string | null;
          tabel: string;
          vereniging_id: string;
        };
        ComputedFields: never;
        Insert: {
          actie: string;
          door_lid_id?: string | null;
          id?: never;
          moment?: string;
          omschrijving: string;
          rij_id?: string | null;
          tabel: string;
          vereniging_id?: string;
        };
        Update: {
          actie?: string;
          door_lid_id?: string | null;
          id?: never;
          moment?: string;
          omschrijving?: string;
          rij_id?: string | null;
          tabel?: string;
          vereniging_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'wijzigingen_log_door_lid_id_fkey';
            columns: ['door_lid_id'];
            isOneToOne: false;
            referencedRelation: 'leden';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wijzigingen_log_vereniging_id_fkey';
            columns: ['vereniging_id'];
            isOneToOne: false;
            referencedRelation: 'verenigingen';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      mijn_activiteiten: {
        Row: {
          aangemaakt: string;
          afmeld_deadline: string | null;
          bak_actief: boolean;
          begint_om: string;
          bijgewerkt: string;
          bus_locatie: string | null;
          bus_vertrektijd: string | null;
          datum: string;
          eindigt_om: string;
          eindtijd: string | null;
          id: string;
          locatie: string | null;
          min_aanwezigen: number | null;
          naam: string;
          notitie: string | null;
          seizoen: number;
          starttijd: string | null;
          status: string;
          type: string;
          verzameltijd: string | null;
        };
        ComputedFields: never;
        Insert: {
          aangemaakt?: string | null;
          afmeld_deadline?: string | null;
          bak_actief?: boolean | null;
          begint_om?: string | null;
          bijgewerkt?: string | null;
          bus_locatie?: string | null;
          bus_vertrektijd?: string | null;
          datum?: string | null;
          eindigt_om?: string | null;
          eindtijd?: string | null;
          id?: string | null;
          locatie?: string | null;
          min_aanwezigen?: number | null;
          naam?: string | null;
          notitie?: string | null;
          seizoen?: number | null;
          starttijd?: string | null;
          status?: string | null;
          type?: string | null;
          verzameltijd?: string | null;
        };
        Update: {
          aangemaakt?: string | null;
          afmeld_deadline?: string | null;
          bak_actief?: boolean | null;
          begint_om?: string | null;
          bijgewerkt?: string | null;
          bus_locatie?: string | null;
          bus_vertrektijd?: string | null;
          datum?: string | null;
          eindigt_om?: string | null;
          eindtijd?: string | null;
          id?: string | null;
          locatie?: string | null;
          min_aanwezigen?: number | null;
          naam?: string | null;
          notitie?: string | null;
          seizoen?: number | null;
          starttijd?: string | null;
          status?: string | null;
          type?: string | null;
          verzameltijd?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      activiteit_opslaan: {
        Args: { p_activiteit_id: string; p_publiceren?: boolean; p_velden: Json; p_wijzigingen: Json };
        Returns: Json;
      };
      beheeroverzicht: {
        Args: Record<PropertyKey, never>;
        Returns: {
          aanwezigen: number;
          activiteit_id: string;
          alleen_groepen: boolean;
          datum: string;
          eindtijd_ontbreekt: boolean;
          eindverantwoordelijke_ontbreekt: boolean;
          lege_plekken: number;
          lege_plekken_per_rol: Json;
          locatie_ontbreekt: boolean;
          min_aanwezigen: number;
          naam: string;
          starttijd_ontbreekt: boolean;
          status: string;
        }[];
      };
      beheerstatus: { Args: Record<PropertyKey, never>; Returns: string };
      concept_verwijderen: { Args: { p_activiteit_id: string }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
