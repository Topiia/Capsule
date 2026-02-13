import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const MasonryGrid = ({ items, renderItem, className = '' }) => {
  const [columnCount, setColumnCount] = useState(4);

  useEffect(() => {
    const updateColumnCount = () => {
      const width = window.innerWidth;
      if (width < 640) setColumnCount(1);
      else if (width < 768) setColumnCount(2);
      else if (width < 1024) setColumnCount(3);
      else setColumnCount(4);
    };

    updateColumnCount();
    window.addEventListener('resize', updateColumnCount);
    return () => window.removeEventListener('resize', updateColumnCount);
  }, []);

  const columns = Array.from({ length: columnCount }, () => []);

  items.forEach((item, index) => {
    columns[index % columnCount].push(item);
  });

  return (
    <div className={`flex gap-6 items-start ${className}`}>
      {columns.map((column, colIndex) => (
        <div key={colIndex} className="flex flex-col gap-6 flex-1 w-full min-w-0">
          {column.map((item, itemIndex) => (
            <div key={item._id || item.id || itemIndex} className="w-full block">
              {renderItem(item, itemIndex)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

MasonryGrid.propTypes = {
  items: PropTypes.array.isRequired,
  renderItem: PropTypes.func.isRequired,
  className: PropTypes.string,
};

export default MasonryGrid;
