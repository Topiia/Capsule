import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'

const SearchBar = () => {
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const navigate = useNavigate()

  const handleSearch = (e) => {
    e.preventDefault()
    if (query.trim()) {
      navigate(`/explore?search=${encodeURIComponent(query.trim())}`)
      setQuery('')
      setIsFocused(false)
    }
  }

  return (
    <motion.form
      onSubmit={handleSearch}
      className="relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="relative">
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <MagnifyingGlassIcon className="h-5 w-5 text-[var(--theme-text-secondary)]" />
        </div>
        
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="Search vlogs..."
          className={`block w-full pl-10 pr-3 py-2 glass-input transition-all duration-200 ${
            isFocused ? 'ring-2 ring-[var(--theme-accent)]' : ''
          }`}
        />
        
        {/* Search suggestions could be added here */}
        {isFocused && query && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 right-0 mt-2 glass-card rounded-lg shadow-lg z-10"
          >
            <div className="p-2">
              <button
                type="submit"
                className="w-full text-left px-3 py-2 rounded hover:bg-[var(--glass-white)] text-[var(--theme-text)]"
              >
                Search for "{query}"
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.form>
  )
}

export default SearchBar