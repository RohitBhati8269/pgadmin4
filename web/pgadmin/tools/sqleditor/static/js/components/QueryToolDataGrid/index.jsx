/////////////////////////////////////////////////////////////
//
// pgAdmin 4 - PostgreSQL Tools
//
// Copyright (C) 2013 - 2024, The pgAdmin Development Team
// This software is released under the PostgreSQL Licence
//
//////////////////////////////////////////////////////////////
import { Box } from '@mui/material';
import { styled } from '@mui/material/styles';
import _ from 'lodash';
import React, {useState, useEffect, useContext, useRef, useLayoutEffect, useMemo, useCallback} from 'react';
import {Row, useRowSelection} from 'react-data-grid';
import LockIcon from '@mui/icons-material/Lock';
import EditIcon from '@mui/icons-material/Edit';
import { QUERY_TOOL_EVENTS } from '../QueryToolConstants';
import * as Editors from './Editors';
import * as Formatters from './Formatters';
import { PgIconButton } from '../../../../../../static/js/components/Buttons';
import MapIcon from '@mui/icons-material/Map';
import { QueryToolEventsContext } from '../QueryToolComponent';
import PropTypes from 'prop-types';
import gettext from 'sources/gettext';
import PgReactDataGrid from '../../../../../../static/js/components/PgReactDataGrid';
import { isMac } from '../../../../../../static/js/keyboard_shortcuts';

export const ROWNUM_KEY = '$_pgadmin_rownum_key_$';
export const GRID_ROW_SELECT_KEY = '$_pgadmin_gridrowselect_key_$';

const StyledPgReactDataGrid = styled(PgReactDataGrid)(({theme})=>({
  '& .QueryTool-columnHeader': {
    padding: '3px 6px',
    height: '100%',
    display: 'flex',
    lineHeight: '16px',
    alignItems: 'center',
    fontWeight: 'normal',
    '& .QueryTool-columnName': {
      fontWeight: 'bold',
    },
    backgroundColor: theme.palette.grey[600],
  },
  '& .QueryTool-editedCell': {
    fontWeight: 'bold',
  },
  '& .QueryTool-deletedRow': {
    '&:before': {
      content: '" "',
      position: 'absolute',
      top: '50%',
      left: 0,
      borderTop: '1px solid ' + theme.palette.error.main,
      width: '100%',
    }
  },
  '& .QueryTool-rowNumCell': {
    padding: '0px 8px',
    color: 'inherit',
  },
  '& .QueryTool-colHeaderSelected': {
    outlineColor: theme.palette.primary.main,
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
  },
  '& .QueryTool-colSelected': {
    outlineColor: theme.palette.primary.main,
    backgroundColor: theme.palette.primary.light,
    color: theme.otherVars.qtDatagridSelectFg,
  },
  '& .rdg-row.rdg-row-even': {
    backgroundColor: theme.palette.grey[200],
  },
  '& .rdg-row': {
    '& .rdg-cell:nth-of-type(1)': {
      backgroundColor: theme.palette.grey[600],
    },
    '& .rdg-cell:nth-of-type(1)[aria-selected="true"]':{
      backgroundColor: theme.palette.primary.main,
      color: theme.palette.primary.contrastText,
    },
    '&[aria-selected="true"] .rdg-cell:nth-of-type(1)': {
      backgroundColor: theme.palette.primary.main,
      color: theme.palette.primary.contrastText,
    }
  },
  '& .rdg-header-row': {
    '& .rdg-cell:nth-of-type(1)': {
      backgroundColor: theme.palette.grey[600]
    },
  },
}));

export const RowInfoContext = React.createContext();
export const DataGridExtrasContext = React.createContext();

// Handles shortcut key events for the grid.
function handleShortcutKeyDown(props) {

  return (e)=>{
    const isTextEditorFocused = document.activeElement?.matches('.Editors-textarea');
    // Handle Copy shortcut (Cmd/Ctrl + C)
    if(((e.metaKey && isMac) || (e.ctrlKey && !isMac)) && e.key !== 'Control' && e.keyCode == 67) {
      e.preventDefault();
      props.handleCopy();
    }
    // Handle Select All (Cmd/Ctrl + A)
    if (((e.metaKey && isMac) || (e.ctrlKey && !isMac)) && e.key === 'a') {
      // If the text editor is focused, let the default select-all behavior run.
      if (!isTextEditorFocused) {
        e.preventDefault();
        props.eventBus.fireEvent(QUERY_TOOL_EVENTS.ALL_ROWS_SELECTED, true);
      }
    }
    if(e.code === 'Enter' && !props.isRowSelected && props.selectedCellIdx > 0) {
      props.selectCell(props.row, props.viewportColumns?.find(columns => columns.idx === props.selectedCellIdx), true);
    }
  };
}

function CustomRow(props) {
  const rowRef = useRef();
  const dataGridExtras = useContext(DataGridExtrasContext);
  const eventBus = useContext(QueryToolEventsContext);

  const rowInfoValue = useMemo(()=>({
    getCellElement: (colIdx)=>{
      return rowRef.current?.querySelector(`.rdg-cell[aria-colindex="${colIdx+1}"]`);
    }
  }), [props.rowIdx]);

  if(!props.isRowSelected && props.selectedCellIdx > 0) {
    dataGridExtras.onSelectedCellChange?.([props.row, props.viewportColumns?.find(columns => columns.idx === props.selectedCellIdx)]);
  } else if(props.selectedCellIdx == 0) {
    dataGridExtras.onSelectedCellChange?.(null);
  }
  const handleKeyDown = handleShortcutKeyDown({
    handleCopy:dataGridExtras.handleCopy, 
    eventBus:eventBus,
    row:props.row,
    isRowSelected:props.isRowSelected,
    selectedCellIdx:props.selectedCellIdx,
    viewportColumns:props.viewportColumns,
    selectCell:props.selectCell
  });

  return (
    <RowInfoContext.Provider value={rowInfoValue}>
      <Row ref={rowRef} onKeyDown={handleKeyDown} {...props} />
    </RowInfoContext.Provider>
  );
}

CustomRow.propTypes = {
  rowIdx: PropTypes.number,
  isRowSelected: PropTypes.bool,
  selectedCellIdx: PropTypes.number,
  row: PropTypes.object,
  viewportColumns: PropTypes.array,
  selectCell: PropTypes.func,
};

function SelectAllHeaderRenderer({isCellSelected, onSelectedColumnsChange}) {
  const [isRowSelected, onRowSelectionChange] = useRowSelection();
  const cellRef = useRef();
  const eventBus = useContext(QueryToolEventsContext);
  const dataGridExtras = useContext(DataGridExtrasContext);
  const onClick = ()=>{
    onSelectedColumnsChange(new Set());
    onRowSelectionChange({ type: 'HEADER', checked: !isRowSelected });
    eventBus.fireEvent(QUERY_TOOL_EVENTS.ALL_PAGE_ROWS_SELECTED, !isRowSelected);
  };

  useLayoutEffect(() => {
    if (!isCellSelected) return;
    cellRef.current?.focus({ preventScroll: true });
  }, [isCellSelected]);

  useEffect(()=>{
    const unregClear = eventBus.registerListener(QUERY_TOOL_EVENTS.CLEAR_ROWS_SELECTED, ()=>{
      onRowSelectionChange({ type: 'HEADER', checked: false });
    });
    const allRowsSelect = eventBus.registerListener(QUERY_TOOL_EVENTS.ALL_ROWS_SELECTED, (isSelected)=>{
      onSelectedColumnsChange(new Set());
      onRowSelectionChange({ type: 'HEADER', checked: isSelected });
      eventBus.fireEvent(QUERY_TOOL_EVENTS.ALL_PAGE_ROWS_SELECTED, isSelected);
    });
    return ()=>{
      unregClear();
      allRowsSelect();
    };
  }, []);

  const handleKeyDown = handleShortcutKeyDown({handleCopy:dataGridExtras.handleCopy, eventBus:eventBus});

  return <div ref={cellRef} style={{width: '100%', height: '100%'}} onClick={onClick}
    tabIndex={0} onKeyDown={handleKeyDown}></div>;
}
SelectAllHeaderRenderer.propTypes = {
  onAllRowsSelectionChange: PropTypes.func,
  isCellSelected: PropTypes.bool,
  onSelectedColumnsChange: PropTypes.func
};

function SelectableHeaderRenderer({column, selectedColumns, onSelectedColumnsChange, isCellSelected}) {
  const cellRef = useRef();
  const eventBus = useContext(QueryToolEventsContext);
  const dataGridExtras = useContext(DataGridExtrasContext);

  if(isCellSelected) {
    dataGridExtras.onSelectedCellChange?.(null);
  }

  const handleKeyDown = handleShortcutKeyDown({handleCopy:dataGridExtras.handleCopy, eventBus:eventBus});

  const onClick = ()=>{
    const newSelectedCols = new Set(selectedColumns);
    if (newSelectedCols.has(column.idx)) {
      newSelectedCols.delete(column.idx);
    } else {
      newSelectedCols.add(column.idx);
    }
    onSelectedColumnsChange(newSelectedCols);
  };

  const isSelected = selectedColumns.has(column.idx);

  useLayoutEffect(() => {
    if (!isCellSelected) return;
    cellRef.current?.focus({ preventScroll: true });
  }, [isCellSelected]);

  return (
    <Box ref={cellRef} className={'QueryTool-columnHeader ' + (isSelected ? 'QueryTool-colHeaderSelected' : null)} onClick={onClick} tabIndex={0}
      onKeyDown={handleKeyDown} data-column-key={column.key}>
      {(column.column_type_internal == 'geometry' || column.column_type_internal == 'geography') &&
      <Box>
        <PgIconButton title={gettext('View all geometries in this column')} icon={<MapIcon data-label="MapIcon"/>} size="small" style={{marginRight: '0.25rem'}} onClick={(e)=>{
          e.stopPropagation();
          eventBus.fireEvent(QUERY_TOOL_EVENTS.TRIGGER_RENDER_GEOMETRIES, column);
        }}/>
      </Box>}
      <Box marginRight="auto">
        <span className='QueryTool-columnName'>{column.display_name}</span><br/>
        <span>{column.display_type}</span>
      </Box>
      <Box marginLeft="4px">{column.can_edit ?
        <EditIcon fontSize="small" style={{fontSize: '0.875rem'}} data-label="EditIcon"/>:
        <LockIcon fontSize="small" style={{fontSize: '0.875rem'}} data-label="LockIcon"/>
      }</Box>
    </Box>
  );
}
SelectableHeaderRenderer.propTypes = {
  column: PropTypes.object,
  selectedColumns: PropTypes.objectOf(Set),
  onSelectedColumnsChange: PropTypes.func,
  isCellSelected: PropTypes.bool,
};

function setEditorFormatter(col) {
  // If grid is editable then add editor else make it readonly
  if (col.cell == 'oid' && col.name == 'oid') {
    col.renderEditCell = null;
    col.renderCell = Formatters.TextFormatter;
  } else if (col.cell == 'Json') {
    col.renderEditCell = Editors.JsonTextEditor;
    col.renderCell = Formatters.TextFormatter;
  } else if (['number', 'oid'].indexOf(col.cell) != -1 || ['xid', 'real'].indexOf(col.type) != -1) {
    col.renderCell = Formatters.NumberFormatter;
    col.renderEditCell = Editors.NumberEditor;
  } else if (col.cell == 'boolean') {
    col.renderEditCell = Editors.CheckboxEditor;
    col.renderCell = Formatters.TextFormatter;
  } else if (col.cell == 'binary') {
    // We do not support editing binary data in SQL editor and data grid.
    col.renderEditCell = null;
    col.renderCell = Formatters.BinaryFormatter;
  } else {
    col.renderEditCell = Editors.TextEditor;
    col.renderCell = Formatters.TextFormatter;
  }
}

function cellClassGetter(col, isSelected, dataChangeStore, rowKeyGetter){
  return (row)=>{
    let cellClasses = [];
    if(dataChangeStore && rowKeyGetter) {
      if(rowKeyGetter(row) in (dataChangeStore?.updated || {})
        && !_.isUndefined(dataChangeStore?.updated[rowKeyGetter(row)]?.data[col.key])
        || rowKeyGetter(row) in (dataChangeStore?.added || {})
      ) {
        cellClasses.push('QueryTool-editedCell');
      }
      if(rowKeyGetter(row) in (dataChangeStore?.deleted || {})) {
        cellClasses.push('QueryTool-deletedRow');
      }
    }
    if(isSelected) {
      cellClasses.push('QueryTool-colSelected');
    }
    return cellClasses.join(' ');
  };
}

function initialiseColumns(columns, rows, totalRowCount, columnWidthBy) {
  let retColumns = [
    ...columns,
  ];
  const canvas = document.createElement('canvas');
  const canvasContext = canvas.getContext('2d');
  canvasContext.font = '12px Roboto';

  for(const col of retColumns) {
    col.width = getTextWidth(col, rows, canvasContext, columnWidthBy);
    col.resizable = true;
    col.renderEditCellOptions = {
      commitOnOutsideClick: false,
      onCellKeyDown: (e)=>{
        // global keyboard shortcuts will work now and will open the the editor for the cell once pgAdmin reopens
        if(!e.metaKey && !e.altKey && !e.shiftKey && !e.ctrlKey){
          /* Do not open the editor */
          e.preventDefault();
        }
      }
    };
    setEditorFormatter(col);
  }

  let rowNumWidth = canvasContext.measureText((totalRowCount||'').toString()).width;
  /* padding 8 on both sides*/
  rowNumWidth += 16;
  let rowNumCol = {
    key: ROWNUM_KEY, name: '', frozen: true, enableResizing: false,
    minWidth: 45, width: rowNumWidth,
  };
  rowNumCol.cellClass = cellClassGetter(rowNumCol);
  retColumns.unshift(rowNumCol);
  canvas.remove();
  return retColumns;
}
function RowNumColFormatter({row, rowKeyGetter, rowIdx, dataChangeStore, onSelectedColumnsChange}) {
  const [isRowSelected, onRowSelectionChange] = useRowSelection();
  const {startRowNum} = useContext(DataGridExtrasContext);

  let rowKey = rowKeyGetter(row);
  let rownum = rowIdx+(startRowNum??1);
  if(rowKey in (dataChangeStore?.added || {})) {
    rownum = rownum+'+';
  } else if(rowKey in (dataChangeStore?.deleted || {})) {
    rownum = rownum+'-';
  }
  return (<div className='QueryTool-rowNumCell' onClick={()=>{
    onSelectedColumnsChange(new Set());
    onRowSelectionChange({ type: 'ROW', row: row, checked: !isRowSelected, isShiftClick: false});
  }} onKeyDown={()=>{/* already taken care by parent */}}>
    {rownum}
  </div>);
}
RowNumColFormatter.propTypes = {
  row: PropTypes.object,
  rowKeyGetter: PropTypes.func,
  rowIdx: PropTypes.number,
  dataChangeStore: PropTypes.object,
  onSelectedColumnsChange: PropTypes.func,
};

function formatColumns(columns, dataChangeStore, selectedColumns, onSelectedColumnsChange, rowKeyGetter) {
  let retColumns = [
    ...columns,
  ];

  const HeaderRenderer = (props)=>{
    return <SelectableHeaderRenderer {...props} selectedColumns={selectedColumns} onSelectedColumnsChange={onSelectedColumnsChange}/>;
  };

  for(const [idx, col] of retColumns.entries()) {
    col.renderHeaderCell = HeaderRenderer;
    col.cellClass = cellClassGetter(col, selectedColumns.has(idx), dataChangeStore, rowKeyGetter);
  }

  let rowNumCol = retColumns[0];
  rowNumCol.renderHeaderCell = (props)=>{
    return <SelectAllHeaderRenderer {...props} onSelectedColumnsChange={onSelectedColumnsChange} />;
  };
  rowNumCol.renderCell = (props)=>{
    return <RowNumColFormatter {...props} rowKeyGetter={rowKeyGetter} dataChangeStore={dataChangeStore} onSelectedColumnsChange={onSelectedColumnsChange} />;
  };

  return retColumns;
}

function getTextWidth(column, rows, canvas, columnWidthBy) {
  const dataWidthReducer = (longest, nextRow) => {
    let value = nextRow[column.key];
    if(_.isNull(value) || _.isUndefined(value)) {
      value = '';
    }
    value = value.toString();
    return longest.length > value.length ? longest : value;
  };

  let columnHeaderLen = column.display_name.length > column.display_type.length ?
    canvas.measureText(column.display_name).width : canvas.measureText(column.display_type).width;
  /* padding 12, icon-width 15 */
  columnHeaderLen += 15 + 12;
  if(column.column_type_internal == 'geometry' || column.column_type_internal == 'geography') {
    columnHeaderLen += 40;
  }
  let width = columnHeaderLen;
  if(typeof(columnWidthBy) == 'number') {
    /* padding 16 */
    width = 16 + Math.ceil(canvas.measureText(rows.reduce(dataWidthReducer, '')).width);
    if(width > columnWidthBy && columnWidthBy > 0) {
      width = columnWidthBy;
    }
    if(width < columnHeaderLen) {
      width = columnHeaderLen;
    }
  }
  /* Gracefull */
  width += 8;
  return width;
}

export default function QueryToolDataGrid({columns, rows, totalRowCount, dataChangeStore,
  onSelectedCellChange, selectedColumns, onSelectedColumnsChange, columnWidthBy, startRowNum, ...props}) {
  const [readyColumns, setReadyColumns] = useState([]);
  const eventBus = useContext(QueryToolEventsContext);
  const onSelectedColumnsChangeWrapped = (arg)=>{
    props.onSelectedRowsChange(new Set());
    onSelectedColumnsChange(arg);
  };

  function handleCopy() {
    eventBus.fireEvent(QUERY_TOOL_EVENTS.TRIGGER_COPY_DATA);
  }

  const renderCustomRow = useCallback((key, props) => {
    return <CustomRow key={key} {...props} />;
  }, []);

  const dataGridExtras = useMemo(()=>({
    onSelectedCellChange, handleCopy, startRowNum
  }), [onSelectedCellChange]);

  useEffect(()=>{
    let initCols = initialiseColumns(columns, rows, totalRowCount, columnWidthBy);
    setReadyColumns(formatColumns(initCols, dataChangeStore, selectedColumns, onSelectedColumnsChangeWrapped, props.rowKeyGetter));
  }, [columns]);

  useEffect(()=>{
    setReadyColumns((prevCols)=>{
      return formatColumns(prevCols, dataChangeStore, selectedColumns, onSelectedColumnsChangeWrapped, props.rowKeyGetter);
    });
  }, [dataChangeStore, selectedColumns]);

  return (
    <DataGridExtrasContext.Provider value={dataGridExtras}>
      <StyledPgReactDataGrid
        id="datagrid"
        columns={readyColumns}
        rows={rows}
        headerRowHeight={40}
        rowHeight={25}
        mincolumnWidthBy={50}
        enableCellSelect={true}
        onCopy={handleCopy}
        onMultiCopy={handleCopy}
        renderers={{
          renderRow: renderCustomRow,
        }}
        enableRangeSelection={true}
        rangeLeftBoundaryColIdx={0}
        onCellKeyDown={({column, rowIdx, selectCell, mode}, e)=>{
          /* Enter should not be propagated to editor and should
          only be used to open the editor */
          if(mode == 'SELECT' && e.code == 'Enter') {
            e.preventGridDefault();
            e.preventDefault();
            e.stopPropagation();
            selectCell({
              idx: column.idx,
              rowIdx
            }, true);
          }
        }}
        {...props}
      />
    </DataGridExtrasContext.Provider>
  );
}

QueryToolDataGrid.propTypes = {
  columns: PropTypes.array,
  rows: PropTypes.array,
  totalRowCount: PropTypes.number,
  dataChangeStore: PropTypes.object,
  onSelectedCellChange: PropTypes.func,
  onSelectedRowsChange: PropTypes.func,
  selectedColumns: PropTypes.objectOf(Set),
  onSelectedColumnsChange: PropTypes.func,
  rowKeyGetter: PropTypes.func,
  columnWidthBy: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  startRowNum: PropTypes.number,
};
