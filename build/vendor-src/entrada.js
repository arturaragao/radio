// Entrada do pacote vendor/tiptap.js: só o que a aba Notas usa, exposto em window.TT.
// Gerar: npm install && npm run build (esbuild). Versões fixadas em package.json / package-lock.json.
import { Editor, Extension, Node, mergeAttributes, InputRule } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Heading from '@tiptap/extension-heading';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Underline from '@tiptap/extension-underline';
import Strike from '@tiptap/extension-strike';
import Link from '@tiptap/extension-link';
import { BulletList, OrderedList, ListItem, TaskList, TaskItem } from '@tiptap/extension-list';
import Blockquote from '@tiptap/extension-blockquote';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import { TextStyle, Color, BackgroundColor } from '@tiptap/extension-text-style';
import { UndoRedo, Dropcursor, Gapcursor, Placeholder, TrailingNode } from '@tiptap/extensions';
import { Suggestion } from '@tiptap/suggestion';
import * as state from '@tiptap/pm/state';
import * as view from '@tiptap/pm/view';
import * as model from '@tiptap/pm/model';

window.TT = {
  Editor, Extension, Node, mergeAttributes, InputRule, Suggestion,
  ext: { Document, Paragraph, Text, Heading, Bold, Italic, Underline, Strike, Link, BulletList, OrderedList, ListItem, TaskList, TaskItem,
    Blockquote, HorizontalRule, Details, DetailsSummary, DetailsContent, Table, TableRow, TableHeader, TableCell, Image, TextStyle, Color, BackgroundColor,
    UndoRedo, Dropcursor, Gapcursor, Placeholder, TrailingNode },
  pm: { state, view, model },
};
