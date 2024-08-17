'use client'

import Nav from './Nav';
import { db, storage } from './firebase';
import { useState, useEffect, useRef } from 'react';
import { Box, Typography, FormGroup, Modal, TextField, Button, Tooltip, Input, Grid, Paper } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import {
  collection,
  addDoc,
  doc,
  query,
  setDoc,
  deleteDoc,
  onSnapshot,
  updateDoc,
  getDoc
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { OpenAI } from 'openai';

export default function Home() {
  // React hooks
  const [image, setImage] = useState(null);
  const [imageBeingEdited, setImageBeingEdited] = useState(null);
  const [recipe, setRecipe] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [inventory, setInventory] = useState([]);
  const [newItem, setNewItem] = useState({name: '', price: '', quantity: '', imageURL: ''});
  const [openState, setOpen] = useState(false);
  const [itemBeingEdited, setItemBeingEdited] = useState({name: '', price: '', quantity: '', imageURL: '', id: ''})
  const storage = getStorage();

  const fileInputAddRef = useRef(null);
  const fileInputEditRef = useRef(null);

  // Handler to trigger file input click
  const handleAddClick = () => {
    if (fileInputAddRef.current) {
      fileInputAddRef.current.click();
    }
  };

  const handleEditClick = () => {
    if (fileInputEditRef.current) {
      fileInputEditRef.current.click();
    }
  };
  /**
   * Fetch items from db everytime a new snapshot of the page is created (i.e. on page changes).
   */ 
  useEffect(() => {
    const q = query(collection(db, 'inventory'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      let inventoryArr = [];
      querySnapshot.forEach((doc) => {
        inventoryArr.push({ ...doc.data(), id: doc.id });
      });
      setInventory(inventoryArr);
      return () => unsubscribe();
    });
  }, []);

  /**
   * Generates a recipe given the contents of one's pantry stored in inventory.
   */
  const generateRecipe = async () => {
    setLoading(true);
    setRecipe('');
    let pantryItems = [];
    inventory.map((item, id) => {
      pantryItems.push(item.name);
    });
    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.NEXT_PUBLIC_OPENROUTER_API_KEY,
      dangerouslyAllowBrowser: true
    });

    const completion = await openai.chat.completions.create({
      model: 'meta-llama/llama-3.1-8b-instruct:free',
      messages: [
        { role: 'user', content: `Given these pantry items: ${pantryItems}, can you generate me a recipe? Be prompt and concise, giving me just enough information via steps to execute the recipe with 1. , 2. , etc.`}
      ],
    });

    // Parse the recipe text to get rid of Llama's formatting (i.e. **Title**, the personal response after the prompt etc.)
    const recipeTitle = completion.choices[0].message.content.match(/\*\*(.*?)\*\*/)[1].trim();
    const stepsRegex = /(\d+)\.\s(.*?)(?=\s\d+\.\s|$)/g;
    let match;
    const steps = [];
    while ((match = stepsRegex.exec(completion.choices[0].message.content)) !== null) {
      steps.push(`${match[1]}. ${match[2].trim()}`);
    }
    const joinedSteps = steps.join('\n');
    const output = `${recipeTitle}\n${joinedSteps}`;

    setRecipe(output);
    setLoading(false);
  };

  /**
   * Adds an item to the DOM and Firebase DB.
   * 
   * @param {*} e Properties associated with the items being added stored in input fields
   */
  const addItem = async (e) => {
    e.preventDefault();
    const storage = getStorage();
    let currImage = newItem.imageURL;
    if (image) {
      const storageRef = ref(storage, `images/${newItem.name}`);
      const snapshot = await uploadBytes(storageRef, image);
      currImage = await getDownloadURL(snapshot.ref);
    }
    if (newItem.name && newItem.price && newItem.quantity) {
      await addDoc(collection(db, 'inventory'), {
        name: newItem.name.trim(),
        price: newItem.price,
        quantity: newItem.quantity,
        imageURL: currImage
      });
      setNewItem({name: '', price: '', quantity: '', imageURL: ''});
      setImage(null);
    }
  }

  /**
   * Toggles the visibility state of the Edit item modal.
   */
  const openEditModal = (item) => {
    setItemBeingEdited({
      ...item,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      imageURL: item.imageURL,
      id: item.id
    });
    setOpen(true);
  }
  const editItem = async (e) => {
    e.preventDefault();
    let currImage = itemBeingEdited.imageURL; // Use the existing imageURL from state
    if (imageBeingEdited) {
      if (currImage) {
        const itemBeingDeleted = getDoc(doc(db, 'inventory', itemBeingEdited.id));
        const deletedImage = ref(storage, `images/${(await itemBeingDeleted).data().name}`);
        await deleteObject(deletedImage).then(() => console.log('File deleted successfully!')).catch((error) => console.log(`Error: ${error}`));
      }
      const storageRef = ref(storage, `images/${itemBeingEdited.name}`);
      const snapshot = await uploadBytes(storageRef, imageBeingEdited);
      currImage = await getDownloadURL(snapshot.ref);
    }
    if (itemBeingEdited.name && itemBeingEdited.price && itemBeingEdited.quantity) {
      await setDoc(doc(db, 'inventory', itemBeingEdited.id), {
        name: itemBeingEdited.name,
        price: itemBeingEdited.price,
        quantity: itemBeingEdited.quantity,
        imageURL: currImage
      });
      setItemBeingEdited({name: '', price: '', quantity: '', id: '', imageURL: ''});
      setImageBeingEdited(null);
      setOpen(false);
    }    
  }
  /**
   * Deletes an item from the Firebase DB by its id.
   * 
   * @param {*} item 
   */
  const deleteItem = async (id) => {
    const itemBeingDeleted = getDoc(doc(db, 'inventory', id));
    const deletedImage = ref(storage, `images/${(await itemBeingDeleted).data().name}`);

    // Delete the image and document from Firebase
    await deleteObject(deletedImage).then(() => console.log('File deleted successfully!')).catch((error) => console.log(`Error: ${error}`));
    await deleteDoc(doc(db, 'inventory', id));
  };

  const handleImageUpload = async (e) => setImage(e.target.files[0]);
  const handleImageEdit = async (e) => setImageBeingEdited(e.target.files[0]);
  return (
  <Box maxHeight={'100%'}>
    <Nav></Nav>
    {/* Modal that pops up when you press the Edit Item (Pen) on an item in the pantry. */}
    <Modal 
      open={openState}
      // onClose={handleClose}
      aria-labelledby='Popup after clicking on Edit Item'
      aria-describedby='Popup that allows users to edit existing pantry entries'>
      <Paper sx={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 400,
        p: 4,}}>
        <Typography id='edit-item' variant='h6' component='h2'>Edit Item</Typography>
        <FormGroup>
          {/* Item name input field */}
          <TextField 
            value={itemBeingEdited.name} 
            onChange={(e) => setItemBeingEdited({ ...itemBeingEdited, name: e.target.value })} 
            label='Item Name' 
            variant='standard' 
            required />
          <Box display={'flex'} gap={2}>
            {/* Price input field */}
            <TextField 
              value={itemBeingEdited.price} 
              onChange={(e) => setItemBeingEdited({ ...itemBeingEdited, price: e.target.value })}
              required 
              type='number' 
              variant='standard' 
              sx={{ width: '50%' }} 
              label='Price' />
            {/* Quantity input field */}
            <TextField
              value={itemBeingEdited.quantity} 
              onChange={(e) => setItemBeingEdited({ ...itemBeingEdited, quantity: e.target.value })}
              required type='number' 
              variant='standard' 
              sx={{ width: '50%' }}  
              label='Quantity' />
          </Box>
          <Box display={'flex'}>
            <Tooltip sx={{ width: '50%' }} title='Upload Item Image Here'>
              <Button onClick={handleEditClick} startIcon={<AddPhotoAlternateIcon fontSize='large'/>}>
                {imageBeingEdited ? 'Image Uploaded!' : ''}
                <Input id='fileInputEdit' inputRef={fileInputEditRef} onChange={handleImageEdit} type='file' accept='image/*' sx={{ display: 'none' }}></Input>
              </Button>
            </Tooltip>
            <Button sx={{ width: '50%' }} onClick={editItem}>
              Apply Changes
            </Button>
          </Box>
        </FormGroup>
      </Paper>
    </Modal>
    {/* Search bar to find specific item in pantry */}
    <Box padding={'2.5%'} display={'flex'} justifyContent={'center'}>
      <Box width={'90%'} display={'flex'}>
        <Box width={'75%'}>
          <Box width={'90%'} padding={2}>
            <TextField 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder='Search for an item'
              variant='standard' 
              fullWidth />
          </Box>

          {/* Shows all pantry items in grid view */}
          <Box>
            <Box width={'95%'}>
              <Box>
                <Grid container>
                  {inventory.map((item, id) => (
                      <Grid 
                        item 
                        key={id} 
                        xs={4}
                        sx={{ display: item.name.toLowerCase().startsWith(search.toLowerCase()) ? 'flex' : 'none' , flexDirection: 'column', justifyContent: 'center', alignItems: 'center'}}>
                        <Paper sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', width: '95%', margin: '8px', padding: '8px'}} >
                          <img src={item.imageURL} alt={item.name} style={{ width: '100%', height: '50%'}}></img>
                          <Typography variant='h5' textAlign={'center'} display={'block'}>{item.name}</Typography>
                          <Box display={'flex'} justifyContent={'space-around'} sx={{ width: '100%'}}>
                            <Typography variant='h6' textAlign={'center'}>${item.price}</ Typography>
                            <Typography variant='h6' textAlign={'center'}>{item.quantity}x</ Typography>  
                          </Box>
                          <Box display={'flex'} justifyContent={'center'} sx={{ width: '100%'}}>
                            <Tooltip onClick={() => openEditModal(item)} title='Edit Item'>
                              <Box><Button><EditIcon /></Button>
                              </Box>
                            </Tooltip>
                            <Tooltip title='Delete Item'>
                              {/* Box needed so since adding onClick to Button messes up */}
                              <Box onClick={() => deleteItem(item.id)}><Button><DeleteIcon /></Button></Box>
                            </Tooltip>
                          </Box>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              </Box>
            </Box>
          </Box>

        {/* This Box element contains the form field to which one can add elements to the list */}
        <Box width={'25%'}>
          <Box height={'100%'} display={'flex'} justifyContent={'center'}>
            <Box width={'95%'}>
              <FormGroup>
                {/* Item name input field */}
                <TextField 
                  value={newItem.name} 
                  onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} 
                  label='Item Name' 
                  variant='standard' 
                  required />
                <Box display={'flex'} gap={2}>
                  {/* Price input field */}
                  <TextField 
                    value={newItem.price} 
                    onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                    required 
                    type='number' 
                    variant='standard' 
                    sx={{ width: '50%' }} 
                    label='Price' />
                  {/* Quantity input field */}
                  <TextField
                    value={newItem.quantity} 
                    onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                    required type='number' 
                    variant='standard' 
                    sx={{ width: '50%' }}  
                    label='Quantity' />
                </Box>
                <Box display={'flex'}>
                  <Tooltip sx={{ width: '50%' }}title='Upload Image of Item Here'>
                    <Button onClick={handleAddClick} startIcon={<AddPhotoAlternateIcon fontSize='large'/>}>
                      {image ? 'Image Uploaded!' : ''}
                      <Input id='fileInputAdd' inputRef={fileInputAddRef} onChange={handleImageUpload} type='file' accept='image/*' sx={{ display: 'none' }}></Input>
                    </Button>
                  </Tooltip>
                  <Button sx={{ width: '50%' }} onClick={addItem}>
                    Add Item
                  </Button>
                </Box>
              </FormGroup>
              {/* Generate a recipe with inventory contents */}
              <Box onClick={() => generateRecipe()}>
                {/* Button shows 'Generating...' and is disabled if clicked, and 'Generate Receipe' otherwise */}
                <Button 
                  sx={{ width: '100%' }} 
                  disabled={loading} 
                  startIcon={loading ? null : <AutoAwesomeIcon />}>
                  { loading ? 'Generating...' : 'Generate Recipe' }
                </Button>
              </Box>
              {/* Generated content appears here */}
              <Box>
                {recipe ? (<Typography variant='body1' sx={{ whiteSpace: 'pre-line' }}>{recipe}</Typography>) : (<Typography variant='body1'>Click the button to generate a recipe!</Typography>)}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  </Box>
  );
}
