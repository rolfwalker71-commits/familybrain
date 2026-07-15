export type PaperlessTag = {
  id: number;
  name: string;
  slug?: string;
};

export type PaperlessDocumentType = {
  id: number;
  name: string;
};

export type PaperlessCorrespondent = {
  id: number;
  name: string;
};

export type PaperlessDocument = {
  id: number;
  title: string;
  content: string;
  tags: number[] | PaperlessTag[];
  document_type: number | PaperlessDocumentType | null;
  correspondent: number | PaperlessCorrespondent | null;
  created: string | null;
  created_date?: string | null;
  modified: string | null;
  added: string | null;
  original_file_name: string | null;
  archived_file_name: string | null;
  [key: string]: unknown;
};

export type PaperlessPaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};
