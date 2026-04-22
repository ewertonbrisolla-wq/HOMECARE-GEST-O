import React from 'react';
import { Shift } from '../types';
import { formatCurrency } from '../lib/shift-logic';
import { auth } from '../firebase';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { History, Calculator, Lock, Trash2, HelpCircle, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from './ui/dialog';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, deleteDoc, onSnapshot } from 'firebase/firestore';
import Markdown from 'react-markdown';

interface RecentShiftsSummaryProps {
  shifts: Shift[];
  title?: string;
  isAdmin?: boolean;
  onEdit?: (shift: Shift) => void;
}

export function RecentShiftsSummary({ shifts, title = "Seus Lançamentos Recentes", isAdmin: propIsAdmin, onEdit }: RecentShiftsSummaryProps) {
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [settings, setSettings] = React.useState<any>({});

  const isAdmin = propIsAdmin ?? (auth.currentUser?.email === "ewerton.brisolla@gmail.com");

  React.useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'general'), (doc) => {
      if (doc.exists()) setSettings(doc.data());
    });
    return () => unsubscribe();
  }, []);

  // Take the 10 most recent shifts
  const recentShifts = shifts.slice(0, 10);

  // Filter shifts: if not admin, only show non-confirmed shifts
  const displayShifts = isAdmin ? recentShifts : recentShifts.filter(s => !s.isConfirmed);

  if (displayShifts.length === 0) return null;
  
  const totalQty = displayShifts.reduce((sum, s) => sum + (s.shiftCount || 0), 0);
  const totalValue = displayShifts.reduce((sum, s) => sum + (s.totalValue || 0), 0);

  const handleEditClick = (shift: Shift) => {
    if (shift.isConfirmed && !isAdmin) {
      toast.error('Impossível Modificar, lançamento confirmado pela gestão', {
        icon: <Lock className="h-4 w-4 text-destructive" />,
        duration: 4000
      });
      return;
    }
    if (onEdit) onEdit(shift);
  };

  const handleDelete = async (e: React.MouseEvent, shift: Shift) => {
    e.stopPropagation();
    if (!shift.id) return;
    if (!window.confirm('Tem certeza que deseja excluir este lançamento?')) return;

    setDeletingId(shift.id);
    try {
      await deleteDoc(doc(db, 'shifts', shift.id));
      toast.success('Lançamento excluído com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'shifts/' + shift.id);
      toast.error('Erro ao excluir lançamento.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto mt-8 border-primary/20 shadow-md overflow-hidden">
      <CardHeader className="bg-primary/5 border-b border-primary/10">
        <CardTitle className="text-lg font-bold text-primary flex items-center gap-2">
          <History className="h-5 w-5" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="font-bold text-primary">Paciente</TableHead>
              <TableHead className="font-bold text-primary text-center">Qtd. Plantões</TableHead>
              <TableHead className="font-bold text-primary text-right">Valor Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayShifts.map((shift) => (
              <TableRow key={shift.id} className="hover:bg-primary/5 transition-colors group">
                <TableCell className="font-medium">
                  <div 
                    className={`cursor-pointer ${shift.isConfirmed && !isAdmin ? 'opacity-80' : 'hover:text-primary hover:underline'}`}
                    onClick={() => handleEditClick(shift)}
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-bold">{shift.patientName}</p>
                      {shift.isConfirmed && <Lock className="h-3 w-3 text-green-600" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">
                      Competência: {shift.competence}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-center font-semibold">
                  <div 
                    className={`inline-flex items-center gap-2 cursor-pointer ${shift.isConfirmed && !isAdmin ? 'opacity-80' : 'hover:text-primary hover:underline'}`}
                    onClick={() => handleEditClick(shift)}
                  >
                    {shift.shiftCount}
                    {!shift.isConfirmed && <Edit2 className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </div>
                </TableCell>
                <TableCell className="text-right font-bold text-primary">
                  <div className="flex items-center justify-end gap-2">
                    {formatCurrency(shift.totalValue)}
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => handleDelete(e, shift)}
                        disabled={deletingId === shift.id}
                      >
                        {deletingId === shift.id ? (
                          <div className="h-4 w-4 animate-spin border-2 border-destructive border-t-transparent rounded-full" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-primary/5 border-t-2 border-primary/20">
              <TableCell className="font-bold text-primary flex items-center gap-2">
                <Calculator className="h-4 w-4" /> TOTAL DOS LANÇAMENTOS ACIMA
              </TableCell>
              <TableCell className="text-center font-black text-primary text-lg">{totalQty}</TableCell>
              <TableCell className="text-right font-black text-primary text-lg">{formatCurrency(totalValue)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <div className="p-3 bg-muted/20 text-center space-y-1">
          <p className="text-xs text-muted-foreground italic">
            Exibindo os últimos {recentShifts.length} lançamentos realizados.
          </p>
          <p className="text-[10px] text-primary font-medium">
            Dica: Use o ícone de lápis para editar lançamentos não confirmados ou a lixeira para excluir (gestor).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
