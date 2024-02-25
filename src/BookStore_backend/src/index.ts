import {
    Canister,
    Err,
    Ok,
    Opt,
    Principal,
    Record,
    Result,
    StableBTreeMap,
    Variant,
    Vec,
    ic,
    int,
    nat64,
    query,
    text,
    update
} from "azle";

// Define a book store error.
const BookStoreError = Variant({
    accountDoesNotExist: Principal,
    bookDoesNotExist: Principal,
    insufficientBalance: text
});

type BookStoreError = typeof BookStoreError.tsType;

// Define a book record.
const Book = Record({
    id: Principal,
    title: text,
    price: int
});

type Book = typeof Book.tsType;

// Define an account record.
const Account = Record({
    id: Principal,
    username: text,
    createdAt: nat64,
    balance: int,
    cart: Vec(Principal)
});

type Account = typeof Account.tsType;

// Create two stable BTree maps to store books and accounts.
const BookStorage = StableBTreeMap<Principal, Book>(0);
const AccountStorage = StableBTreeMap<Principal, Account>(1);

export default Canister({
    /**
     * Add a book.
     * @param {text} title the title of the book.
     * @param {int} price the price of the book.
     * @returns the created book.
     */
    addBook: update([text, int], Book, (title, price) => {
        const id = generateId();
        const book: Book = {
            id,
            title,
            price
        };

        BookStorage.insert(book.id, book);

        return book;
    }),
    /**
     * Remove a book.
     * @param {Principal} id the book principal to remove.
     * @returns the removed book or an error if the book does not exist.
     */
    getBook: query([Principal], Opt(Book), (id) => {
        return BookStorage.get(id);
    }),
    /**
     * Get all books.
     * @returns all books.
     */
    getBooks: query([], Vec(Book), () => {
        return BookStorage.values();
    }),
    /**
     * Create an account.
     * @param {text} username the username of the account.
     * @param {int} balance the initial balance of the account.
     * @returns the created account.
     */
    createAccount: update([text, int], Account, (username, balance) => {
        const id = generateId();
        const account: Account = {
            id,
            username,
            createdAt: ic.time(),
            balance,
            cart: []
        };

        AccountStorage.insert(account.id, account);

        return account;
    }),
    /**
     * Remove an account.
     * @param {Principal} id the account principal to remove.
     * @returns the removed account or an error if the account does not exist.
     */
    removeAccount: update(
        [Principal],
        Result(Account, BookStoreError),
        (id) => {
            const account = AccountStorage.get(id).Some;

            if (!account) {
                return Err({
                    accountDoesNotExist: id
                });
            }

            AccountStorage.remove(id);

            return Ok(account);
        }
    ),
    /**
     * Get an account.
     * @param {Principal} id the account principal to get.
     * @returns the account if exists, `null` otherwise.
     */
    getAccount: query([Principal], Opt(Account), (id) => {
        return AccountStorage.get(id);
    }),
    /**
     * Get all accounts.
     * @returns all accounts.
     */
    getAccounts: query([], Vec(Account), () => {
        return AccountStorage.values();
    }),
    /**
     * Update the balance of the account.
     * @param {Principal} id the account principal to update.
     * @param {int} balance the new balance.
     * @returns the account with the updated balance or an error if the account does not exist.
     */
    updateBalance: update(
        [Principal, int],
        Result(Account, BookStoreError),
        (id, balance) => {
            const account = AccountStorage.get(id).Some;

            if (!account) {
                return Err({
                    accountDoesNotExist: id
                });
            }

            account.balance = balance;
            AccountStorage.insert(id, account);

            return Ok(account);
        }
    ),
    /**
     * Add a book to the cart.
     * @param {Principal} accountId the account principal to add to.
     * @param {Principal} bookId the book principal to add.
     * @returns the account with the book added to the cart or an error if the account or the book does not exist.
     */
    addToCart: update(
        [Principal, Principal],
        Result(Account, BookStoreError),
        (accountId, bookId) => {
            const account = AccountStorage.get(accountId).Some;

            if (!account) {
                return Err({
                    accountDoesNotExist: accountId
                });
            }

            if (BookStorage.get(bookId).None) {
                return Err({
                    bookDoesNotExist: bookId
                });
            }

            account.cart.push(bookId);
            AccountStorage.insert(accountId, account);

            return Ok(account);
        }
    ),
    /**
     * Get the cart of the account.
     * @param {Principal} accountId the account principal to get the cart from.
     * @returns the books in the cart or an error if the account does not exist.
     */
    getCart: query(
        [Principal],
        Result(Vec(Book), BookStoreError),
        (accountId) => {
            const account = AccountStorage.get(accountId).Some;

            if (!account) {
                return Err({
                    accountDoesNotExist: accountId
                });
            }

            const books = account.cart.map(
                (bookId) => BookStorage.get(bookId).Some!
            );

            return Ok(books);
        }
    ),
    /**
     * Remove a book from the cart.
     * @param {Principal} accountId the account principal to remove from.
     * @param {Principal} bookId the book principal to remove.
     * @returns the account with the book removed from the cart or an error if the account or the book does not exist.
     */
    removeFromCart: update(
        [Principal, Principal],
        Result(Account, BookStoreError),
        (accountId, bookId) => {
            const account = AccountStorage.get(accountId).Some;

            if (!account) {
                return Err({
                    accountDoesNotExist: accountId
                });
            }

            if (BookStorage.get(bookId).None) {
                return Err({
                    bookDoesNotExist: bookId
                });
            }

            account.cart = account.cart.filter((id) => id !== bookId);
            AccountStorage.insert(accountId, account);

            return Ok(account);
        }
    ),
    /**
     * Checkout the cart and empty it.
     * @param {Principal} accountId the account principal to checkout.
     * @returns the account with an empty cart or an error if the account does not exist or has insufficient balance.
     */
    checkout: update(
        [Principal],
        Result(Account, BookStoreError),
        (accountId) => {
            const account = AccountStorage.get(accountId).Some;

            if (!account) {
                return Err({
                    accountDoesNotExist: accountId
                });
            }

            const totalPrice = account.cart
                .map((bookId) => Number(BookStorage.get(bookId).Some!.price))
                .reduce((acc, price) => acc + price, 0);

            if (account.balance < totalPrice) {
                return Err({
                    insufficientBalance: `${
                        totalPrice - Number(account.balance)
                    } more needed.`
                });
            }

            account.cart = [];
            AccountStorage.insert(accountId, account);

            return Ok(account);
        }
    )
});

/**
 * @returns a random Principal.
 */
function generateId(): Principal {
    const randomBytes = new Array(29)
        .fill(0)
        .map((_) => Math.floor(Math.random() * 256));

    return Principal.fromUint8Array(Uint8Array.from(randomBytes));
}
